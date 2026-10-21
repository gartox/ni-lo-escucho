import { execFile as executeFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir, readFile, stat } from 'node:fs/promises';
import { basename, extname, join } from 'node:path';
import { randomUUID } from 'node:crypto';

const execFile = promisify(executeFile);
const extensions = new Set(['.wav', '.mp3', '.m4a', '.ogg', '.opus', '.aiff']);
const limit = 25 * 1024 * 1024;

function checkAudio(audioPath) {
  if (!extensions.has(extname(audioPath).toLowerCase())) {
    throw new Error('Formato de audio no permitido. Usa wav, mp3, m4a, ogg, opus o aiff.');
  }
}

function segmentsFrom(data) {
  return Array.isArray(data.segments)
    ? data.segments.map(segment => ({
      start: Number(segment.start) || 0,
      end: Number(segment.end) || 0,
      text: String(segment.text ?? '').trim()
    }))
    : [];
}

export async function transcribeWhisper(config, audioPath) {
  checkAudio(audioPath);
  const start = Date.now();
  const outputDir = config.tmpDir || join('/tmp', `ni-lo-escucho-${randomUUID()}`);
  await mkdir(outputDir, { recursive: true });

  try {
    const audioStat = await stat(audioPath);
    if (audioStat.size > limit) throw new Error('El audio supera el límite de 25 MB.');

    const bin = config.whisperBin || '/opt/homebrew/bin/whisper';
    try {
      await execFile(
        bin,
        [
          '--model', config.whisperModel || 'small',
          '--language', 'es',
          '--output_format', 'json',
          '--output_dir', outputDir,
          audioPath
        ],
        { shell: false }
      );
    } catch (error) {
      if (error.code === 'ENOENT') {
        throw new Error(`No se encontró Whisper en ${bin}. Instala la CLI de Whisper.`);
      }
      throw new Error(`Whisper no pudo transcribir el audio: ${error.message}`);
    }

    const jsonPath = join(outputDir, `${basename(audioPath, extname(audioPath))}.json`);
    const data = JSON.parse(await readFile(jsonPath, 'utf8'));
    return {
      text: typeof data.text === 'string' ? data.text.trim() : '',
      segments: segmentsFrom(data),
      engine: 'whisper',
      ms: Date.now() - start
    };
  } catch (error) {
    if (error.message.includes('25 MB') || error.message.includes('Formato')) throw error;
    if (error instanceof SyntaxError) {
      throw new Error('Whisper devolvió un JSON inválido.');
    }
    throw error;
  }
}

export async function transcribeElevenLabs(config, audioPath) {
  checkAudio(audioPath);
  const audioStat = await stat(audioPath);
  if (audioStat.size > limit) throw new Error('El audio supera el límite de 25 MB.');

  const start = Date.now();
  const form = new FormData();
  form.append('model_id', 'scribe_v1');
  form.append('language_code', 'spa');
  form.append('file', new Blob([await readFile(audioPath)]), basename(audioPath));

  let response;
  try {
    response = await fetch(
      config.elevenlabsUrl || 'https://api.elevenlabs.io/v1/speech-to-text',
      {
        method: 'POST',
        headers: { 'xi-api-key': config.elevenlabsApiKey },
        body: form,
        signal: AbortSignal.timeout(config.elevenlabsTimeoutMs ?? 180000)
      }
    );
  } catch {
    throw new Error('ElevenLabs no responde. Revisa la conexión y vuelve a intentar.');
  }
  if (!response.ok) throw new Error(`ElevenLabs respondió con error ${response.status}.`);

  const data = await response.json();
  return {
    text: String(data.text ?? '').trim(),
    segments: segmentsFrom(data),
    engine: 'elevenlabs',
    ms: Date.now() - start
  };
}
