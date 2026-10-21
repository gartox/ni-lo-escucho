import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { compileWorkflow, validateWorkflow } from '../src/compile.js';
import { understand } from '../src/understand.js';

const samples = JSON.parse(
  await readFile(new URL('../samples/requests.json', import.meta.url))
);
const config = {
  ollamaUrl: process.env.OLLAMA_URL || 'http://127.0.0.1:11434',
  model: process.env.NI_LO_ESCUCHO_MODEL || 'gemma4:e4b-it-qat'
};
const results = [];

for (const sample of samples) {
  const started = Date.now();
  try {
    const spec = await understand(config, sample.text);
    const workflow = compileWorkflow(spec, { name: 'Evaluación' });
    validateWorkflow(workflow);
    results.push({
      expected: sample.expected,
      trigger: spec.trigger.type,
      steps: spec.steps.map(step => step.type),
      condition: spec.conditions.length > 0,
      ms: Date.now() - started
    });
  } catch (error) {
    results.push({ error: error.message });
  }
}

await mkdir('eval', { recursive: true });
await writeFile('eval/results.json', JSON.stringify(results, null, 2));
console.table(results);
