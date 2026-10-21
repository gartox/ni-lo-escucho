import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { HttpError } from './ollama.js';
import { transcribeElevenLabs, transcribeWhisper } from './transcribe.js';
import { understand } from './understand.js';
import { compileWorkflow, toClientReply } from './compile.js';
import { createJournal } from './journal.js';

const publicDirectory = resolve(fileURLToPath(new URL('../public/', import.meta.url)));
const bodyLimit = 25 * 1024 * 1024;
const allowedExtensions = new Set(['.wav', '.mp3', '.m4a', '.ogg', '.opus', '.aiff']);
const contentTypes = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json'
};

const object = value => value && typeof value === 'object' && !Array.isArray(value);

function send(response, status, value, headers = {}) {
  response.writeHead(status, {
    'Cache-Control': 'no-store',
    'Content-Type': 'application/json; charset=utf-8',
    ...headers
  });
  response.end(JSON.stringify(value));
}

async function readBody(request) {
  let size = 0;
  const chunks = [];
  let tooLarge = false;
  for await (const chunk of request) {
    size += chunk.length;
    if (size <= bodyLimit) chunks.push(chunk);
    else tooLarge = true;
  }
  if (tooLarge) throw new HttpError(413, 'El cuerpo supera el límite de 25 MB.');

  try {
    const value = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if (!object(value)) throw new Error();
    return value;
  } catch {
    throw new HttpError(400, 'El cuerpo debe ser un objeto JSON válido.');
  }
}

function extension(filename) {
  const value = typeof filename === 'string' ? filename : '';
  const suffix = extname(value).toLowerCase();
  if (!allowedExtensions.has(suffix)) {
    throw new HttpError(
      400,
      'Formato de audio no permitido. Usa wav, mp3, m4a, ogg, opus o aiff.'
    );
  }
  return suffix;
}

async function processRequest(body, config) {
  let transcript;
  let transcribeMs = 0;

  if (typeof body.text === 'string' && body.text.trim()) {
    transcript = {
      text: body.text.slice(0, 12000),
      segments: [],
      engine: 'text',
      ms: 0
    };
  } else if (typeof body.audio === 'string' && body.audio) {
    if (body.engine === 'elevenlabs' && !config.elevenlabsApiKey) {
      throw new HttpError(400, 'ElevenLabs requiere ELEVENLABS_API_KEY.');
    }

    const suffix = extension(body.filename);
    const encoded = body.audio.replace(/^data:.*?;base64,/, '');
    const bytes = Buffer.from(encoded, 'base64');
    if (bytes.length > bodyLimit) {
      throw new HttpError(413, 'El audio supera el límite de 25 MB.');
    }

    await mkdir(config.dataDir, { recursive: true });
    const tempPath = resolve(config.dataDir, `.audio-${Date.now()}${suffix}`);
    await writeFile(tempPath, bytes, { flag: 'wx' });
    try {
      const transcribeConfig = {
        ...config,
        engine: body.engine || config.engine
      };
      const result = transcribeConfig.engine === 'elevenlabs'
        ? await transcribeElevenLabs(transcribeConfig, tempPath)
        : await transcribeWhisper(transcribeConfig, tempPath);
      transcript = result;
      transcribeMs = result.ms;
    } finally {
      await unlink(tempPath).catch(() => {});
    }
  } else {
    throw new HttpError(400, 'Envía audio o texto.');
  }

  const started = Date.now();
  const spec = await (config.understand || understand)(config, transcript.text);
  const understandMs = Date.now() - started;
  const compileStarted = Date.now();
  const workflow = compileWorkflow(spec, {
    name: body.name || 'Flujo de Ni lo escucho'
  });
  const compileMs = Date.now() - compileStarted;
  return {
    transcript,
    spec,
    workflow,
    reply: toClientReply(spec),
    timings: { transcribeMs, understandMs, compileMs }
  };
}

async function serveStatic(request, response, path) {
  if (request.method !== 'GET') throw new HttpError(405, 'Método no permitido.');
  if (path.includes('..') || path.includes('\\') || path.includes('\0')) {
    throw new HttpError(404, 'Ruta no encontrada.');
  }

  const file = resolve(publicDirectory, path === '/' ? 'index.html' : `.${path}`);
  if (!file.startsWith(publicDirectory + sep)) {
    throw new HttpError(404, 'Ruta no encontrada.');
  }

  let content;
  try {
    content = await readFile(file);
  } catch (error) {
    if (['ENOENT', 'EISDIR', 'ENOTDIR'].includes(error.code)) {
      throw new HttpError(404, 'Archivo no encontrado.');
    }
    throw error;
  }

  response.writeHead(200, {
    'Cache-Control': 'no-cache',
    'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self'; " +
      "connect-src 'self'; object-src 'none'; base-uri 'none'",
    'Content-Type': contentTypes[extname(file)] ?? 'application/octet-stream',
    'X-Content-Type-Options': 'nosniff'
  });
  response.end(content);
}

export function createApp(config = {}) {
  const settings = {
    dataDir: resolve(config.dataDir || './data'),
    ollamaUrl: config.ollamaUrl || 'http://127.0.0.1:11434',
    model: config.model || 'gemma4:e4b-it-qat',
    whisperModel: config.whisperModel || 'small',
    ...config
  };
  const journal = createJournal(settings.dataDir);

  const handler = async (request, response) => {
    try {
      const url = new URL(request.url, 'http://localhost');
      if (url.pathname === '/api/process') {
        if (request.method !== 'POST') {
          throw new HttpError(405, 'Método no permitido.');
        }
        const result = await processRequest(await readBody(request), settings);
        return send(response, 200, await journal.add(result));
      }

      if (url.pathname === '/api/requests') {
        if (request.method !== 'GET') {
          throw new HttpError(405, 'Método no permitido.');
        }
        return send(response, 200, await journal.list());
      }

      const workflowMatch = /^\/api\/requests\/([^/]+)\/workflow\.json$/.exec(url.pathname);
      if (workflowMatch) {
        const item = (await journal.list()).find(entry => entry.id === workflowMatch[1]);
        if (!item) throw new HttpError(404, 'Solicitud no encontrada.');
        response.writeHead(200, {
          'Content-Type': 'application/json; charset=utf-8',
          'Content-Disposition': `attachment; filename="${item.id}.workflow.json"`
        });
        return response.end(JSON.stringify(item.workflow, null, 2));
      }
      return serveStatic(request, response, url.pathname);
    } catch (error) {
      const status = error instanceof HttpError ? error.status : 500;
      send(response, status, { error: error.message || 'Error interno.' });
    }
  };

  return createServer(handler);
}
