const triggerTypes = ['form', 'webhook', 'schedule', 'email_received', 'manual'];
const stepTypes = [
  'save_to_sheet',
  'send_email',
  'send_whatsapp',
  'send_telegram',
  'notify_slack',
  'http_request',
  'set_fields',
  'wait',
  'respond_webhook'
];
const operators = ['equals', 'not_equals', 'greater_than', 'less_than', 'contains'];

export const specSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    summary: { type: 'string' },
    trigger: {
      type: 'object',
      additionalProperties: false,
      properties: {
        type: { type: 'string', enum: triggerTypes },
        details: { type: 'string' }
      },
      required: ['type', 'details']
    },
    steps: {
      type: 'array',
      maxItems: 8,
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          id: { type: 'string' },
          type: { type: 'string', enum: stepTypes },
          details: { type: 'string' },
          when: { type: ['string', 'null'] }
        },
        required: ['id', 'type', 'details', 'when']
      }
    },
    conditions: {
      type: 'array',
      maxItems: 3,
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          id: { type: 'string' },
          field: { type: 'string' },
          operator: { type: 'string', enum: operators },
          value: { type: 'string' },
          then: { type: 'array', items: { type: 'string' } },
          else: { type: 'array', items: { type: 'string' } }
        },
        required: ['id', 'field', 'operator', 'value', 'then', 'else']
      }
    },
    missing: { type: 'array', items: { type: 'string' } },
    questions: {
      type: 'array',
      maxItems: 6,
      items: { type: 'string' }
    }
  },
  required: ['summary', 'trigger', 'steps', 'conditions', 'missing', 'questions']
};

const object = value => (
  value && typeof value === 'object' && !Array.isArray(value) ? value : {}
);

const text = (value, max = 600) => (
  typeof value === 'string' ? value.trim().slice(0, max) : ''
);

const list = (value, max, size = 600) => (
  Array.isArray(value)
    ? value
      .filter(item => typeof item === 'string')
      .slice(0, max)
      .map(item => text(item, size))
    : []
);

const questionFor = value => (
  `No sé hacer «${text(value, 80) || 'eso'}» con los bloques que tengo; ¿me lo explicas?`
);

function cleanId(value, fallback, used) {
  let id = text(value, 80)
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '') || fallback;
  const base = id;
  let index = 2;
  while (used.has(id)) id = `${base}-${index++}`;
  used.add(id);
  return id;
}

export function normalizeSpec(value) {
  const data = object(value);
  const questions = list(data.questions, 6);
  const triggerData = object(data.trigger);
  const triggerType = triggerTypes.includes(triggerData.type)
    ? triggerData.type
    : 'manual';
  if (triggerType === 'manual' && triggerData.type !== 'manual') {
    questions.push(questionFor(triggerData.type));
  }

  const used = new Set();
  const steps = [];
  const originalIds = new Map();
  for (const raw of Array.isArray(data.steps) ? data.steps.slice(0, 8) : []) {
    const item = object(raw);
    if (!stepTypes.includes(item.type)) {
      questions.push(questionFor(item.type));
      continue;
    }
    const normalizedId = cleanId(item.id, `paso-${steps.length + 1}`, used);
    const originalId = text(item.id, 80).toLowerCase();
    if (originalId && !originalIds.has(originalId)) {
      originalIds.set(originalId, normalizedId);
    }
    steps.push({
      id: normalizedId,
      type: item.type,
      details: text(item.details),
      when: item.when === null ? null : text(item.when) || null
    });
  }

  const ids = new Set(steps.map(step => step.id));
  const resolveReference = id => {
    const value = text(id, 80).toLowerCase();
    return originalIds.get(value) || value;
  };
  const conditions = [];
  const conditionIds = new Set();
  for (const raw of Array.isArray(data.conditions) ? data.conditions.slice(0, 3) : []) {
    const item = object(raw);
    if (!operators.includes(item.operator)) continue;
    conditions.push({
      id: cleanId(item.id, `condicion-${conditions.length + 1}`, conditionIds),
      field: text(item.field, 120),
      operator: item.operator,
      value: text(item.value, 200),
      then: list(item.then, 8, 80).map(resolveReference).filter(id => ids.has(id)),
      else: list(item.else, 8, 80).map(resolveReference).filter(id => ids.has(id))
    });
  }

  return {
    summary: text(data.summary),
    trigger: {
      type: triggerType,
      details: text(triggerData.details)
    },
    steps,
    conditions,
    missing: list(data.missing, 12),
    questions: questions.slice(0, 6)
  };
}

export { stepTypes, triggerTypes, operators };
