import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createApp } from '../src/app.js';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

function listen(server) {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolve(`http://127.0.0.1:${server.address().port}`));
  });
}

test('procesa texto, guarda la solicitud y permite descargar el workflow', async () => {
  const dataDir = await mkdtemp(join(tmpdir(), 'ni-lo-http-'));
  let receivedBody = '';
  const ollama = createServer(async (request, response) => {
    for await (const chunk of request) receivedBody += chunk;
    response.writeHead(200, { 'Content-Type': 'application/json' });
    response.end(
      '{"message":{"content":"{\\"summary\\":\\"Recibir pedidos.\\",' +
      '\\"trigger\\":{\\"type\\":\\"manual\\",\\"details\\":\\"manual\\"},' +
      '\\"steps\\":[],\\"conditions\\":[],\\"missing\\":[],' +
      '\\"questions\\":[]}"}}'
    );
  });
  const app = createApp({ dataDir, ollamaUrl: await listen(ollama), model: 'modelo' });
  const baseUrl = await listen(app);
  try {
    const response = await fetch(`${baseUrl}/api/process`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{"text":"hazlo"}'
    });
    const result = await response.json();
    assert.equal(response.status, 200);
    assert.match(receivedBody, /\\"hazlo\\"/);
    assert.equal(result.workflow.active, false);
    const download = await fetch(`${baseUrl}/api/requests/${result.id}/workflow.json`);
    assert.match(download.headers.get('content-disposition'), /attachment/);
  } finally {
    app.closeAllConnections(); ollama.closeAllConnections();
    await new Promise(resolve => app.close(resolve)); await new Promise(resolve => ollama.close(resolve));
    await rm(dataDir, { recursive: true, force: true });
  }
});

test('un archivo inexistente responde 404 y el servidor sigue vivo', async () => {
  const dataDir = await mkdtemp(join(tmpdir(), 'ni-lo-404-'));
  const app = createApp({ dataDir, ollamaUrl: 'http://127.0.0.1:9', model: 'modelo' });
  const baseUrl = await listen(app);
  try {
    const missing = await fetch(`${baseUrl}/favicon.ico`);
    assert.equal(missing.status, 404);
    const home = await fetch(`${baseUrl}/`);
    assert.equal(home.status, 200);
  } finally {
    app.closeAllConnections();
    await new Promise(resolve => app.close(resolve));
    await rm(dataDir, { recursive: true, force: true });
  }
});
