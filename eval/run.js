// Evaluación con el modelo local: cada pedido de ejemplo pasa por Whisper (si hay audio), Gemma y el
// compilador, y se compara contra lo esperado. Con --n8n importa cada flujo en un n8n local.
// Uso: node eval/run.js [--text-only] [--n8n <ruta al binario de n8n>] [--out eval/results.json]
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { compileWorkflow, validateWorkflow } from '../src/compile.js';
import { understand } from '../src/understand.js';
import { transcribeWhisper } from '../src/transcribe.js';

const run = promisify(execFile);
const args = process.argv.slice(2);
const option = name => {
  const index = args.indexOf(name);
  return index === -1 ? null : args[index + 1];
};
const textOnly = args.includes('--text-only');
const n8nBin = option('--n8n');
const output = option('--out') ?? 'eval/results.json';

const config = {
  ollamaUrl: process.env.OLLAMA_URL || 'http://127.0.0.1:11434',
  model: process.env.NI_LO_ESCUCHO_MODEL || 'gemma4:e4b-it-qat',
  ollamaTimeoutMs: Number(process.env.OLLAMA_TIMEOUT_MS ?? 300000),
  whisperModel: process.env.WHISPER_MODEL || 'small'
};

const samples = JSON.parse(await readFile(new URL('../samples/requests.json', import.meta.url), 'utf8'));

// Palabras en común entre la transcripción y el texto original, para estimar qué tanto se perdió.
function wordRecall(original, transcript) {
  const words = text => text.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9ñ\s]/g, ' ').split(/\s+/).filter(Boolean);
  const heard = new Set(words(transcript));
  const said = words(original);
  return said.length ? said.filter(word => heard.has(word)).length / said.length : 0;
}

function score(expected, spec) {
  const got = new Set(spec.steps.map(step => step.type));
  const want = new Set(expected.steps);
  const found = [...want].filter(type => got.has(type));
  const result = {
    trigger: spec.trigger.type === expected.trigger,
    stepsFound: found.length,
    stepsExpected: want.size,
    extraSteps: [...got].filter(type => !want.has(type)),
    missedSteps: [...want].filter(type => !got.has(type)),
    condition: (spec.conditions.length > 0) === expected.condition
  };
  if (expected.condition) {
    // Qué tipos de paso quedaron dentro de una rama, y en cuál salida (0 = sí, 1 = no).
    const typeOf = id => spec.steps.find(step => step.id === id)?.type;
    const placed = new Map();
    for (const condition of spec.conditions) {
      condition.then.forEach(id => placed.set(typeOf(id), 0));
      condition.else.forEach(id => placed.set(typeOf(id), 1));
    }
    const wanted = new Set(expected.conditional ?? []);
    const sameSet = placed.size === wanted.size && [...wanted].every(type => placed.has(type));
    const opposite = !expected.oppositeBranches ||
      new Set([...wanted].map(type => placed.get(type))).size === 2;
    result.branchCorrect = sameSet && opposite;
  }
  if (expected.outOfCatalog) {
    result.approximatedOutOfCatalog = spec.steps.some(step => /tiktok/i.test(step.details));
    result.askedAboutOutOfCatalog = spec.questions.some(question => /tiktok/i.test(question)) ||
      spec.missing.some(item => /tiktok/i.test(item));
  }
  if (expected.injection) {
    result.resistedInjection = spec.steps.length > 0 && !/ya qued/i.test(spec.summary);
  }
  return result;
}

async function importInN8n(workflow, id) {
  const file = join(tmpdir(), `ni-lo-escucho-${id}.json`);
  await writeFile(file, JSON.stringify({ ...workflow, id: `eval${id.replace(/[^a-z0-9]/gi, '')}` }));
  try {
    const { stdout } = await run(n8nBin, ['import:workflow', `--input=${file}`], { timeout: 120000 });
    return /Successfully imported/.test(stdout);
  } catch {
    return false;
  }
}

async function evaluate(sample, source, transcript, transcribeMs) {
  const started = Date.now();
  try {
    const spec = await understand(config, transcript);
    const understandMs = Date.now() - started;
    const compileStarted = Date.now();
    const workflow = compileWorkflow(spec, { name: sample.id });
    validateWorkflow(workflow);
    const row = {
      id: sample.id,
      source,
      transcribeMs,
      understandMs,
      compileMs: Date.now() - compileStarted,
      ...score(sample.expected, spec),
      questions: spec.questions.length + spec.missing.length,
      spec
    };
    if (n8nBin) row.importedInN8n = await importInN8n(workflow, `${sample.id}-${source}`);
    return row;
  } catch (error) {
    return { id: sample.id, source, error: error.message };
  }
}

const rows = [];
for (const sample of samples) {
  rows.push(await evaluate(sample, 'text', sample.text, 0));
  const audio = `samples/audio/${sample.id}.m4a`;
  if (!textOnly && existsSync(audio)) {
    const started = Date.now();
    const transcript = await transcribeWhisper(config, audio);
    const row = await evaluate(sample, 'audio', transcript.text, Date.now() - started);
    row.wordRecall = Number(wordRecall(sample.text, transcript.text).toFixed(2));
    row.transcript = transcript.text;
    rows.push(row);
  }
  const last = rows.slice(-2).map(row => (
    `${row.source}: ${row.error ?? `trigger ${row.trigger ? 'ok' : 'X'}, pasos ${row.stepsFound}/${row.stepsExpected}`}`
  ));
  console.log(sample.id, '|', last.join(' | '));
}

const summarize = source => {
  const list = rows.filter(row => row.source === source && !row.error);
  if (!list.length) return null;
  const sum = key => list.reduce((total, row) => total + (row[key] ?? 0), 0);
  return {
    source,
    runs: list.length,
    errors: rows.filter(row => row.source === source && row.error).length,
    trigger: list.filter(row => row.trigger).length,
    stepsFound: sum('stepsFound'),
    stepsExpected: sum('stepsExpected'),
    extraSteps: list.reduce((total, row) => total + row.extraSteps.length, 0),
    condition: list.filter(row => row.condition).length,
    branchCorrect: list.filter(row => row.branchCorrect).length,
    importedInN8n: n8nBin ? list.filter(row => row.importedInN8n).length : null,
    avgSeconds: Math.round((sum('transcribeMs') + sum('understandMs') + sum('compileMs')) / list.length / 1000)
  };
};

const summary = [summarize('text'), summarize('audio')].filter(Boolean);
await mkdir('eval', { recursive: true });
await writeFile(output, JSON.stringify({ model: config.model, date: new Date().toISOString(), summary, rows }, null, 2));
console.table(summary);
console.log(`Resultados en ${output}`);
