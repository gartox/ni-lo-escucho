export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

const structuredUnsupported = new Set();

async function post(config, payload) {
  let response;
  try {
    response = await fetch(new URL('/api/chat', config.ollamaUrl), {
      method: 'POST',
      signal: AbortSignal.timeout(config.ollamaTimeoutMs ?? 180000),
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
  } catch {
    throw new HttpError(503,
      `Ollama no responde. Ejecuta ollama serve y descarga el modelo con ollama pull ${config.model}.`);
  }
  return { status: response.status, text: await response.text() };
}

export function extractJson(value) {
  try {
    return JSON.parse(value);
  } catch {}
  const start = value.indexOf('{');
  const end = value.lastIndexOf('}');
  if (start < 0 || end <= start) throw new Error('sin JSON');
  return JSON.parse(value.slice(start, end + 1));
}

function parseModelResponse(text) {
  const envelope = JSON.parse(text);
  if (typeof envelope.message?.content !== 'string') throw new Error('respuesta sin contenido');
  return extractJson(envelope.message.content);
}

export async function chat(config, schema, prompt, system = 'You are a careful assistant.') {
  const key = `${config.ollamaUrl}|${config.model}`;
  const content = `${prompt}\n\nRespond with ONLY one JSON object, no markdown, ` +
    `matching this JSON schema: ${JSON.stringify(schema)}`;
  const base = {
    model: config.model,
    stream: false,
    options: { temperature: 0.2 },
    messages: [{ role: 'system', content: system }, { role: 'user', content }]
  };
  for (let attempt = 0; attempt < 2; attempt += 1) {
    let result = structuredUnsupported.has(key)
      ? { status: 501 }
      : await post(config, { ...base, format: schema });
    if (result.status === 501) {
      structuredUnsupported.add(key);
      result = await post(config, base);
    }
    if (result.status === 404) {
      throw new HttpError(503,
        `El modelo ${config.model} no está descargado. Ejecuta ollama pull ${config.model}.`);
    }
    if (result.status < 200 || result.status >= 300) {
      throw new HttpError(502, `Ollama respondió con error ${result.status}. Vuelve a intentar.`);
    }
    try {
      return parseModelResponse(result.text);
    } catch {
      // Un segundo intento suele bastar cuando el modelo responde en prosa.
    }
  }
  throw new HttpError(502, 'El modelo devolvió JSON inválido. Intenta de nuevo.');
}
