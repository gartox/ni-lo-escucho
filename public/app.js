const $ = id => document.getElementById(id);

const addText = (parent, value) => {
  parent.append(document.createTextNode(String(value ?? '')));
};

// Dibuja el flujo compilado (no la especificación): lo que se ve es lo que se va a importar en n8n.
function drawFlow(result) {
  const list = $('flow');
  list.replaceChildren();
  const { nodes, connections } = result.workflow;
  const targets = name => (connections[name]?.main ?? []).map(output => (
    (output ?? []).map(connection => connection.node)
  ));
  const incoming = new Set(Object.values(connections).flatMap(entry => (
    entry.main.flat().map(connection => connection.node)
  )));
  const start = nodes.find(item => !incoming.has(item.name));
  const seen = new Set();

  const add = (name, depth, label) => {
    if (seen.has(name)) return;
    seen.add(name);
    const item = document.createElement('li');
    item.style.marginLeft = `${depth * 24}px`;
    addText(item, label ? `${label} → ${name}` : name);
    list.append(item);
    const outputs = targets(name);
    const isCondition = nodes.find(node => node.name === name)?.type === 'n8n-nodes-base.if';
    outputs.forEach((group, index) => {
      group.forEach(next => {
        const branch = isCondition ? (index === 0 ? 'Sí' : 'No') : '';
        add(next, isCondition ? depth + 1 : depth, branch);
      });
    });
  };
  if (start) add(start.name, 0, '');
}

$('processForm').addEventListener('submit', async event => {
  event.preventDefault();
  $('message').textContent = 'Procesando en esta laptop…';
  const file = $('audio').files[0];
  let body;

  if (file) {
    body = {
      audio: await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onerror = () => reject(new Error('No se pudo leer el audio.'));
        reader.onload = () => resolve(reader.result);
        reader.readAsDataURL(file);
      }),
      filename: file.name
    };
  } else {
    body = { text: $('text').value };
  }

  try {
    const response = await fetch('/api/process', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'No se pudo procesar.');
    $('transcript').textContent = result.transcript.text;
    $('summary').textContent = result.spec.summary;
    $('reply').textContent = result.reply;
    drawFlow(result);
    $('download').href = `data:application/json;charset=utf-8,${encodeURIComponent(
      JSON.stringify(result.workflow, null, 2)
    )}`;
    $('result').hidden = false;
    $('message').textContent = 'Listo. Revisa el borrador antes de importarlo en n8n.';
  } catch (error) {
    // fetch() lanza TypeError cuando el servidor no responde; ese mensaje viene en inglés.
    $('message').textContent = error instanceof TypeError
      ? 'No se pudo conectar con Ni lo escucho. Revisa que el servidor siga corriendo.'
      : error.message;
  }
});

$('copy').addEventListener('click', async () => {
  await navigator.clipboard.writeText($('reply').textContent);
  $('message').textContent = 'Respuesta copiada.';
});
