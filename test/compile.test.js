import test from 'node:test';
import assert from 'node:assert/strict';
import { compileWorkflow, toClientReply, validateWorkflow } from '../src/compile.js';
import { normalizeSpec } from '../src/spec.js';

const base = type => normalizeSpec({
  summary: 'Resumen.',
  trigger: { type, details: 'Al pasar algo' },
  steps: [
    { id: 'guardar', type: 'save_to_sheet', details: '', when: null },
    { id: 'correo', type: 'send_email', details: '', when: null }
  ]
});

test('compila todos los disparadores y valida el resultado', () => {
  for (const type of ['form', 'webhook', 'schedule', 'email_received', 'manual']) {
    const workflow = compileWorkflow(base(type));
    assert.equal(validateWorkflow(workflow), true);
    const triggers = workflow.nodes.filter(node => (
      node.type.includes('Trigger') ||
      node.type.includes('webhook') ||
      node.type.includes('emailRead')
    ));
    assert.equal(triggers.length, 1);
  }
});

test('compila los pasos del catálogo y deja marcadores pendientes', () => {
  const types = [
    'save_to_sheet', 'send_email', 'send_whatsapp', 'send_telegram',
    'notify_slack', 'http_request', 'set_fields', 'wait', 'respond_webhook'
  ];
  for (const type of types) {
    const workflow = compileWorkflow(normalizeSpec({
      trigger: { type: 'manual' },
      steps: [{ id: 'p', type }]
    }));
    assert.equal(workflow.nodes.length, 2);
    if (type !== 'set_fields' && type !== 'wait') assert.match(JSON.stringify(workflow), /«PENDIENTE:/);
  }
});

test('conecta then en salida cero y else en salida uno', () => {
  const spec = normalizeSpec({ trigger: { type: 'webhook' }, steps: [
    { id: 'yes', type: 'send_email' }, { id: 'no', type: 'send_whatsapp' }
  ], conditions: [{
    id: 'tipo', field: 'tipo', operator: 'equals', value: 'mayoreo',
    then: ['yes'], else: ['no']
  }] });
  const workflow = compileWorkflow(spec);
  const condition = workflow.nodes.find(node => node.type === 'n8n-nodes-base.if');
  assert.equal(workflow.connections[condition.name].main[0][0].node, 'Enviar correo');
  assert.equal(workflow.connections[condition.name].main[1][0].node, 'Avisar por WhatsApp');
});

test('rechaza tipos, conexiones, duplicados, dos disparadores y ciclos', () => {
  const workflow = compileWorkflow(base('manual'));
  assert.throws(() => validateWorkflow({
    ...workflow,
    nodes: [...workflow.nodes, { ...workflow.nodes[1], name: 'x', type: 'inventado' }]
  }));
  assert.throws(() => validateWorkflow({
    ...workflow,
    connections: { 'Ejecutar manualmente': { main: [[{ node: 'no existe' }]] } }
  }));
  assert.throws(() => validateWorkflow({
    ...workflow,
    nodes: [...workflow.nodes, { ...workflow.nodes[1], name: workflow.nodes[1].name }]
  }));
  assert.throws(() => validateWorkflow({ ...workflow, nodes: [...workflow.nodes, workflow.nodes[0]] }));
  assert.throws(() => validateWorkflow({
    ...workflow,
    connections: {
      'Ejecutar manualmente': { main: [[{ node: 'Guardar en hoja' }]] },
      'Guardar en hoja': { main: [[{ node: 'Ejecutar manualmente' }]] }
    }
  }));
});

test('compila condiciones con nodos en español, posiciones únicas y sin credenciales', () => {
  const spec = normalizeSpec({
    trigger: { type: 'form', details: 'Formulario' },
    steps: [
      { id: 'guardar', type: 'save_to_sheet', details: '', when: null },
      { id: 'correo', type: 'send_email', details: '', when: null },
      { id: 'whatsapp', type: 'send_whatsapp', details: '', when: null }
    ],
    conditions: [{
      id: 'mayoreo',
      field: 'tipo',
      operator: 'equals',
      value: 'mayoreo',
      then: ['correo'],
      else: ['whatsapp']
    }]
  });
  const workflow = compileWorkflow(spec);
  const names = workflow.nodes.map(node => node.name);
  const positions = workflow.nodes.map(node => JSON.stringify(node.position));

  assert.equal(new Set(names).size, names.length);
  assert.equal(new Set(positions).size, positions.length);
  assert.ok(names.every(name => !/[a-z]+_[a-z]+/.test(name)));
  for (const node of workflow.nodes) {
    assert.equal(Object.hasOwn(node, 'credentials'), false);
  }
  assert.equal(validateWorkflow(workflow), true);
});

test('la respuesta al cliente usa resumen y preguntas numeradas en español', () => {
  const reply = toClientReply({
    summary: 'Guardar pedidos y avisar cuando sean de mayoreo.',
    trigger: { type: 'form', details: 'se llena el formulario' },
    steps: [{ type: 'save_to_sheet', details: 'la fila del pedido' }],
    questions: ['¿Cuál hoja debo usar?'],
    missing: ['número de WhatsApp']
  });

  assert.match(reply, /Guardar pedidos/);
  assert.match(reply, /1\. ¿Cuál hoja debo usar\?/);
  assert.match(reply, /2\. ¿Me compartes número de WhatsApp\?/);
  assert.doesNotMatch(reply, /save_to_sheet|trigger|steps/);
});

test('la condición usa operadores de n8n y no deja inyectar código en la expresión', () => {
  const spec = normalizeSpec({
    summary: 'x',
    trigger: { type: 'manual', details: '' },
    steps: [{ id: 'a', type: 'set_fields', details: '', when: null }],
    conditions: [{
      id: 'c1',
      field: 'total"] }} {{ $exec(\'rm -rf /\') }} [x',
      operator: 'greater_than',
      value: '50 personas',
      then: ['a'],
      else: []
    }],
    missing: [],
    questions: []
  });
  const workflow = compileWorkflow(spec, { name: 'prueba' });
  const condition = workflow.nodes.find(item => item.type === 'n8n-nodes-base.if');
  const rule = condition.parameters.conditions.conditions[0];
  assert.deepEqual(rule.operator, { type: 'number', operation: 'gt' });
  assert.equal(rule.rightValue, 50);
  // El campo queda reducido a letras, números y guion bajo: sin comillas, corchetes ni llaves.
  assert.match(rule.leftValue, /^=\{\{ Number\(\$json\.[A-Za-z0-9_]+\) \}\}$/);
});

test('la condición recibe los datos de la cadena y lo pedido para todos no pasa por ella', () => {
  const spec = normalizeSpec({
    summary: 'taquiza',
    trigger: { type: 'form', details: '' },
    steps: [
      { id: 'hoja', type: 'save_to_sheet', details: '', when: null },
      { id: 'aviso', type: 'send_whatsapp', details: '', when: null },
      { id: 'gracias', type: 'send_email', details: '', when: null }
    ],
    conditions: [{
      id: 'c1', field: 'personas', operator: 'greater_than', value: '50', then: ['aviso'], else: []
    }],
    missing: [],
    questions: []
  });
  const workflow = compileWorkflow(spec, { name: 'taquiza' });
  const targets = from => (workflow.connections[from]?.main ?? []).map(output => (
    (output ?? []).map(connection => connection.node)
  ));
  const sheet = workflow.nodes.find(item => item.type === 'n8n-nodes-base.googleSheets').name;
  const condition = workflow.nodes.find(item => item.type === 'n8n-nodes-base.if').name;
  const whatsapp = workflow.nodes.find(item => item.type === 'n8n-nodes-base.whatsApp').name;
  const email = workflow.nodes.find(item => item.type === 'n8n-nodes-base.emailSend').name;
  const trigger = workflow.nodes.find(item => item.type === 'n8n-nodes-base.formTrigger').name;
  assert.deepEqual(targets(trigger), [[sheet]]);
  assert.deepEqual(targets(sheet), [[condition, email]]);
  assert.deepEqual(targets(condition), [[whatsapp]]);
});

test('la respuesta al cliente nunca le pide contraseñas, tokens ni credenciales', () => {
  const reply = toClientReply(normalizeSpec({
    summary: 'Pedidos',
    trigger: { type: 'form', details: '' },
    steps: [],
    conditions: [],
    missing: ['Credenciales de Google Sheets', 'Token de Telegram', 'Nombre de la hoja de pedidos'],
    questions: ['¿Qué método de autenticación requiere la API?', '¿A qué número aviso?']
  }));
  assert.doesNotMatch(reply, /credencial|token|autenticaci/i);
  assert.match(reply, /nombre de la hoja de pedidos/);
  assert.match(reply, /¿A qué número aviso\?/);
  assert.match(reply, /no me las mandes por aquí/);
});
