import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('el frontend construye texto sin HTML crudo', async () => {
  const app = await readFile(new URL('../public/app.js', import.meta.url), 'utf8');
  assert.doesNotMatch(app, /innerHTML|outerHTML|insertAdjacentHTML/);
});

test('las muestras usan enums válidos', async () => {
  const samples = JSON.parse(await readFile(new URL('../samples/requests.json', import.meta.url)));
  const triggers = new Set(['form', 'webhook', 'schedule', 'email_received', 'manual']);
  const steps = new Set([
    'save_to_sheet', 'send_email', 'send_whatsapp', 'send_telegram',
    'notify_slack', 'http_request', 'set_fields', 'wait', 'respond_webhook'
  ]);
  assert.equal(samples.length, 12);
  for (const sample of samples) {
    assert.ok(triggers.has(sample.expected.trigger));
    sample.expected.steps.forEach(step => assert.ok(steps.has(step)));
  }
});
