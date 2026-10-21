#!/usr/bin/env node
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { basename, extname, join, resolve } from 'node:path';
import { transcribeElevenLabs, transcribeWhisper } from '../src/transcribe.js';
import { understand } from '../src/understand.js';
import { compileWorkflow, toClientReply } from '../src/compile.js';

const args = process.argv.slice(2);
const input = args[0];
if (!input) {
  console.error('Uso: ni-lo-escucho <audio-o-txt> [--out dir] [--engine whisper|elevenlabs]');
  process.exit(1);
}

const outIndex = args.indexOf('--out');
const out = resolve(outIndex >= 0 ? args[outIndex + 1] : '.');
const engineIndex = args.indexOf('--engine');
const engine = engineIndex >= 0 ? args[engineIndex + 1] : 'whisper';
const config = {
  ollamaUrl: process.env.OLLAMA_URL || 'http://127.0.0.1:11434',
  model: process.env.NI_LO_ESCUCHO_MODEL || 'gemma4:e4b-it-qat',
  whisperModel: process.env.WHISPER_MODEL || 'small',
  elevenlabsApiKey: process.env.ELEVENLABS_API_KEY,
  engine
};

const started = Date.now();
let transcript;
if (extname(input).toLowerCase() === '.txt') {
  transcript = {
    text: await readFile(input, 'utf8'),
    segments: [],
    engine: 'text',
    ms: 0
  };
} else {
  transcript = engine === 'elevenlabs'
    ? await transcribeElevenLabs(config, input)
    : await transcribeWhisper(config, input);
}

const understoodAt = Date.now();
const spec = await understand(config, transcript.text);
const workflow = compileWorkflow(spec, { name: basename(input, extname(input)) });
const reply = toClientReply(spec);
await mkdir(out, { recursive: true });
const name = basename(input, extname(input));
await writeFile(join(out, `${name}.workflow.json`), JSON.stringify(workflow, null, 2));
await writeFile(join(out, `${name}.respuesta.txt`), reply);
console.log(reply);
console.log(
  `\nTiempos: transcripción ${transcript.ms} ms, ` +
  `entendimiento ${Date.now() - understoodAt} ms, total ${Date.now() - started} ms.`
);
