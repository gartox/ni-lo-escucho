import { stepCatalog, triggerCatalog } from './catalog.js';

const names = {
  save_to_sheet: 'Guardar en hoja',
  send_email: 'Enviar correo',
  send_whatsapp: 'Avisar por WhatsApp',
  send_telegram: 'Avisar por Telegram',
  notify_slack: 'Avisar en Slack',
  http_request: 'Hacer solicitud HTTP',
  set_fields: 'Definir campos',
  wait: 'Esperar',
  respond_webhook: 'Responder webhook'
};

const triggerNames = {
  form: 'Recibir formulario',
  webhook: 'Recibir webhook',
  schedule: 'Programar flujo',
  email_received: 'Recibir correo',
  manual: 'Ejecutar manualmente'
};

const clone = value => JSON.parse(JSON.stringify(value));

function node(name, template, position) {
  return { name, ...clone(template), position };
}

// Operadores de la especificación traducidos al formato del nodo IF v2 de n8n.
const operators = {
  equals: { type: 'string', operation: 'equals' },
  not_equals: { type: 'string', operation: 'notEquals' },
  contains: { type: 'string', operation: 'contains' },
  greater_than: { type: 'number', operation: 'gt' },
  less_than: { type: 'number', operation: 'lt' }
};

// El nombre del campo viene del modelo y termina dentro de una expresión de n8n: solo se permiten
// letras, números y guion bajo, para que un audio no pueda inyectar código en la expresión.
export function safeField(field) {
  const clean = String(field ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .replace(/\s+/g, '_')
    .replace(/[^A-Za-z0-9_]/g, '')
    .slice(0, 40);
  return clean || 'campo';
}

function conditionNode(condition, position) {
  const field = safeField(condition.field);
  const operator = operators[condition.operator] ?? operators.equals;
  const numeric = operator.type === 'number';
  const number = Number(String(condition.value).replace(/[^0-9.-]/g, ''));
  return {
    name: `¿${field.replace(/_/g, ' ')}?`,
    type: 'n8n-nodes-base.if',
    typeVersion: 2,
    parameters: {
      conditions: {
        options: {
          caseSensitive: true,
          leftValue: '',
          typeValidation: 'loose'
        },
        conditions: [{
          leftValue: numeric ? `={{ Number($json.${field}) }}` : `={{ $json.${field} }}`,
          rightValue: numeric && Number.isFinite(number) ? number : String(condition.value),
          operator
        }],
        combinator: 'and'
      }
    },
    position
  };
}

function uniqueName(nodes, name) {
  let unique = name;
  let suffix = 2;
  while (nodes.some(item => item.name === unique)) {
    unique = `${name} ${suffix++}`;
  }
  return unique;
}

export function compileWorkflow(spec, { name = 'Flujo generado' } = {}) {
  const nodes = [];
  const connections = {};
  const trigger = node(
    triggerNames[spec.trigger.type],
    triggerCatalog[spec.trigger.type],
    [0, 0]
  );
  nodes.push(trigger);

  const addConnection = (from, to, output = 0) => {
    const entry = connections[from.name] ?? { main: [] };
    while (entry.main.length <= output) entry.main.push([]);
    entry.main[output].push({ node: to.name, type: 'main', index: 0 });
    connections[from.name] = entry;
  };
  const addStep = (step, position) => {
    const item = node(uniqueName(nodes, names[step.type]), stepCatalog[step.type], position);
    nodes.push(item);
    return item;
  };

  // Los pasos sin condición forman la cadena principal, en el orden en que los pidió el cliente.
  // Cada condición se inserta donde aparece su primer paso, recibe los datos de la cadena y abre
  // dos ramas (sí en la salida 0, no en la salida 1). La cadena principal no pasa por la condición:
  // lo que el cliente pidió "para todos" se sigue ejecutando para todos.
  let previous = trigger;
  let column = 1;
  const branches = new Map();
  const openCondition = condition => {
    if (branches.has(condition.id)) return branches.get(condition.id);
    // Las condiciones y sus ramas van en filas aparte para que la cadena principal se lea derecha.
    const item = conditionNode(condition, [column * 260, 240]);
    item.name = uniqueName(nodes, item.name);
    nodes.push(item);
    addConnection(previous, item);
    const state = { item, column: column + 1, last: [item, item] };
    branches.set(condition.id, state);
    column += 1;
    return state;
  };

  for (const step of spec.steps) {
    const condition = spec.conditions.find(item => (
      item.then.includes(step.id) || item.else.includes(step.id)
    ));
    if (!condition) {
      const current = addStep(step, [column * 260, 0]);
      addConnection(previous, current);
      previous = current;
      column += 1;
      continue;
    }
    const state = openCondition(condition);
    const output = condition.then.includes(step.id) ? 0 : 1;
    const current = addStep(step, [state.column * 260, output === 0 ? 240 : 420]);
    const from = state.last[output];
    addConnection(from, current, from === state.item ? output : 0);
    state.last[output] = current;
    state.column += 1;
  }
  // Una condición sin pasos propios no hace nada en n8n: se omite del flujo (sigue en la especificación).

  const workflow = {
    name,
    nodes,
    connections,
    settings: { executionOrder: 'v1' },
    active: false
  };
  validateWorkflow(workflow);
  return workflow;
}

function hasCycle(workflow) {
  const states = new Map();
  const visit = name => {
    if (states.get(name) === 1) return true;
    if (states.get(name) === 2) return false;
    states.set(name, 1);
    for (const output of workflow.connections[name]?.main ?? []) {
      for (const connection of output ?? []) {
        if (visit(connection.node)) return true;
      }
    }
    states.set(name, 2);
    return false;
  };
  return workflow.nodes.some(item => visit(item.name));
}

export function validateWorkflow(workflow) {
  const allowed = new Set([
    ...Object.values(triggerCatalog),
    ...Object.values(stepCatalog)
  ].map(item => item.type));
  const nodeNames = new Set();

  for (const item of workflow.nodes ?? []) {
    if (!allowed.has(item.type) && item.type !== 'n8n-nodes-base.if') {
      throw new Error('Tipo de nodo fuera del catálogo.');
    }
    if (nodeNames.has(item.name)) {
      throw new Error('Hay nombres de nodo repetidos.');
    }
    nodeNames.add(item.name);
    const encoded = JSON.stringify(item.parameters ?? {});
    if (/credentials/i.test(encoded) || /(?:sk-|api[_-]?key|bearer\s+[a-z0-9])/i.test(encoded)) {
      throw new Error('El workflow contiene una credencial o clave.');
    }
  }

  const triggers = workflow.nodes.filter(item => (
    Object.values(triggerCatalog).some(template => template.type === item.type)
  ));
  if (triggers.length !== 1) {
    throw new Error('El workflow debe tener exactamente un disparador.');
  }

  for (const [source, data] of Object.entries(workflow.connections ?? {})) {
    if (!nodeNames.has(source)) {
      throw new Error('La conexión sale de un nodo inexistente.');
    }
    for (const group of data.main ?? []) {
      for (const connection of group ?? []) {
        if (!nodeNames.has(connection.node)) {
          throw new Error('La conexión apunta a un nodo inexistente.');
        }
      }
    }
  }
  if (hasCycle(workflow)) throw new Error('El workflow contiene un ciclo.');
  return true;
}

// Las cuentas se conectan en n8n con el cliente, nunca se piden por WhatsApp.
const secretLike = /credencial|contraseñ|password|token|api ?key|clave api|clave de api|autenticaci/i;

const sentence = text => `${String(text).trim().replace(/[.\s]+$/, '')}.`;
// Solo baja la primera letra de palabras comunes ("Número" → "número"), no siglas como "ID".
const lowerFirst = text => (/^[A-ZÁÉÍÓÚÑ][a-záéíóúñ]/.test(text) ? text[0].toLowerCase() + text.slice(1) : text);

export function toClientReply(spec) {
  const trigger = triggerNames[spec.trigger.type] || 'Iniciar el flujo';
  const lines = [
    'Entendí esto:',
    `• ${spec.summary || 'Quieres automatizar este proceso.'}`,
    `• Disparador: ${sentence(spec.trigger.details || trigger)}`
  ];
  for (const step of spec.steps) {
    lines.push(`• ${names[step.type] || 'Acción pendiente'}: ${sentence(step.details || 'pendiente de definir')}`);
  }

  const asksForSecrets = [...spec.questions, ...spec.missing].some(item => secretLike.test(item));
  const questions = [
    ...spec.questions.filter(item => !secretLike.test(item)),
    // Si el modelo ya redactó preguntas, los datos faltantes suelen repetirlas: solo se usan sin ellas.
    ...(spec.questions.length ? [] : spec.missing
      .filter(item => !secretLike.test(item))
      .map(item => `¿Me compartes ${lowerFirst(item)}?`))
  ].slice(0, 6);
  if (questions.length) {
    lines.push('', 'Preguntas para completar el flujo:');
    questions.forEach((question, index) => lines.push(`${index + 1}. ${question}`));
  }
  if (asksForSecrets) {
    lines.push('', 'Las cuentas y contraseñas las conectamos juntos en n8n; por favor no me las mandes por aquí.');
  }
  return lines.join('\n');
}
