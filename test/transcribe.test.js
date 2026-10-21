import test from 'node:test';
import assert from 'node:assert/strict';
import { chmod, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { transcribeWhisper, transcribeElevenLabs } from '../src/transcribe.js';
import { createServer } from 'node:http';

test('Whisper recibe argumentos separados y no interpreta el nombre del archivo', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'ni-lo-whisper-'));
  const bin = join(directory, 'whisper-falso');
  const audio = join(directory, '; rm -rf ~.wav');
  await writeFile(audio, 'audio');
  await writeFile(
    bin,
    '#!/bin/sh\nout=""\n' +
    'while [ "$#" -gt 0 ]; do ' +
    'if [ "$1" = "--output_dir" ]; then shift; out="$1"; fi; shift; done\n' +
    'printf \'{"text":"hola","segments":[{"start":0,"end":1,' +
    '"text":" hola "}]}\' > "$out/; rm -rf ~.json"\n'
  );
  await chmod(bin, 0o755);
  const result = await transcribeWhisper({ whisperBin: bin, tmpDir: directory }, audio);
  assert.equal(result.text, 'hola');
  assert.equal(result.engine, 'whisper');
  await rm(directory, { recursive: true, force: true });
});

test('ElevenLabs manda el encabezado y el formulario multipart', async () => {
  let receivedHeaders;
  let receivedBody = '';
  const server = createServer(async (request, response) => {
    receivedHeaders = request.headers;
    for await (const chunk of request) receivedBody += chunk;
    response.writeHead(200, { 'Content-Type': 'application/json' });
    response.end('{"text":"hola","segments":[]}');
  });
  const directory = await mkdtemp(join(tmpdir(), 'ni-lo-eleven-'));
  const audio = join(directory, 'audio.wav');
  await writeFile(audio, 'audio');
  const baseUrl = await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolve(
      `http://127.0.0.1:${server.address().port}/v1/speech-to-text`
    ));
  });
  try {
    const result = await transcribeElevenLabs({
      elevenlabsUrl: baseUrl,
      elevenlabsApiKey: 'clave-secreta'
    }, audio);
    assert.equal(result.text, 'hola');
    assert.equal(receivedHeaders['xi-api-key'], 'clave-secreta');
    assert.match(receivedBody, /model_id/);
    assert.match(receivedBody, /scribe_v1/);
    assert.match(receivedBody, /audio.wav/);
  } finally {
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
    await rm(directory, { recursive: true, force: true });
  }
});

test('ElevenLabs 401 no expone la clave en el error', async () => {
  const server = createServer((request, response) => {
    response.writeHead(401);
    response.end('clave-secreta inválida');
  });
  const directory = await mkdtemp(join(tmpdir(), 'ni-lo-eleven-401-'));
  const audio = join(directory, 'audio.wav');
  await writeFile(audio, 'audio');
  const baseUrl = await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => (
      resolve(`http://127.0.0.1:${server.address().port}/v1/speech-to-text`)
    ));
  });
  try {
    await assert.rejects(
      transcribeElevenLabs({
        elevenlabsUrl: baseUrl,
        elevenlabsApiKey: 'clave-secreta'
      }, audio),
      error => {
        assert.doesNotMatch(error.message, /clave-secreta/);
        assert.match(error.message, /401/);
        return true;
      }
    );
  } finally {
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
    await rm(directory, { recursive: true, force: true });
  }
});
