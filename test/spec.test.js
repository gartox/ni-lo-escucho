import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeSpec } from '../src/spec.js';

test('normaliza enums, referencias, ids y campos extra', () => {
  const result = normalizeSpec({
    summary: '  Pedido  ', extra: true, trigger: { type: 'inventado', details: 'x' },
    steps: [{ id: ' A ', type: 'save_to_sheet', details: ' hoja ', when: null },
      { id: 'a', type: 'send_email', details: '', when: 'x' }, { type: 'tiktok' }],
    conditions: [{
      id: 'c', field: 'tipo', operator: 'equals', value: 'mayoreo',
      then: ['a', 'no'], else: ['a']
    }],
    missing: [' cuenta ', 2], questions: ['¿Cuál hoja?']
  });
  assert.equal(result.trigger.type, 'manual');
  assert.deepEqual(result.steps.map(step => step.id), ['a', 'a-2']);
  assert.deepEqual(result.conditions[0].then, ['a']);
  assert.deepEqual(result.conditions[0].else, ['a']);
  assert.equal(result.questions.some(question => question.includes('tiktok')), true);
  assert.equal(result.missing[0], 'cuenta');
});
