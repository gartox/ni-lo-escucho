const $ = id => document.getElementById(id);

const addText = (parent, value) => {
  parent.append(document.createTextNode(String(value ?? '')));
};

function drawFlow(result) {
  const list = $('flow');
  list.replaceChildren();
  const trigger = document.createElement('li');
  addText(trigger, `Disparador: ${result.spec.trigger.details || result.spec.trigger.type}`);
  list.append(trigger);

  for (const step of result.spec.steps) {
    const item = document.createElement('li');
    const conditional = result.spec.conditions.some(condition => (
      condition.then.includes(step.id) || condition.else.includes(step.id)
    ));
    item.style.marginLeft = `${conditional ? 24 : 0}px`;
    addText(item, `${step.type}: ${step.details || 'pendiente'}`);
    list.append(item);
  }
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
    $('message').textContent = error.message;
  }
});

$('copy').addEventListener('click', async () => {
  await navigator.clipboard.writeText($('reply').textContent);
  $('message').textContent = 'Respuesta copiada.';
});
