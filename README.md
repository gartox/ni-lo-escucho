# Ni lo escucho

Ni lo escucho convierte el audio desordenado de un cliente en un primer borrador de flujo para n8n. Está pensado para freelancers y agencias de automatización; el autor vende automatizaciones a pymes en Tabasco.

Whisper transcribe, Gemma 4 (por Ollama) llena una especificación cerrada y un compilador determinista genera el JSON de n8n. El modelo nunca escribe el JSON del workflow. Los audios se quedan en la laptop: no se necesita internet ni tiene costo de nube. ElevenLabs es opcional y explícito para quien prefiera esa transcripción.

## Cómo correrlo

Instala Ollama y Whisper, descarga el modelo y arranca:

```bash
ollama pull gemma4:e4b-it-qat
npm start
```

Abre `http://127.0.0.1:3000`. Para la CLI:

```bash
node bin/ni-lo-escucho.js pedido.txt --out salida
node bin/ni-lo-escucho.js pedido.m4a --engine whisper --out salida
```

Variables útiles: `PORT`, `HOST`, `OLLAMA_URL`, `NI_LO_ESCUCHO_MODEL`, `WHISPER_MODEL`, `DATA_DIR`, `OLLAMA_TIMEOUT_MS` y `ELEVENLABS_API_KEY`.

Importa el archivo `.workflow.json` desde n8n y configura manualmente las credenciales y marcadores pendientes. Esto es un borrador para revisar, no un flujo en producción.

### En español

La idea es que una persona pueda responderle rápido a su cliente: qué entendió, qué bloques sí puede armar y qué datos faltan. Si el pedido no cabe en el catálogo, se convierte en pregunta en lugar de inventar una integración.
