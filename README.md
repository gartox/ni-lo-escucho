# Ni lo escucho

Ni lo escucho turns an unstructured customer voice request into a first-draft workflow for n8n. It is aimed at freelancers and automation agencies; the author sells automation services to small businesses in Tabasco, Mexico.

Whisper transcribes the request, Gemma 4 E4B (through Ollama) fills a closed specification, and a deterministic compiler generates the n8n JSON. The model never writes the workflow JSON. Audio stays on the laptop, so the default path does not require internet access or cloud fees. ElevenLabs is optional and explicit for users who prefer that transcription service.

## How to run

Install Ollama and Whisper, download the model, and start the app:

```bash
ollama pull gemma4:e4b-it-qat
npm start
```

Open `http://127.0.0.1:3000`. For the CLI:

```bash
node bin/ni-lo-escucho.js request.txt --out output
node bin/ni-lo-escucho.js request.m4a --engine whisper --out output
```

Useful variables: `PORT`, `HOST`, `OLLAMA_URL`, `NI_LO_ESCUCHO_MODEL`, `WHISPER_MODEL`, `DATA_DIR`, `OLLAMA_TIMEOUT_MS`, and `ELEVENLABS_API_KEY`.

Import the `.workflow.json` file into n8n and configure credentials and pending placeholders manually. This is a draft to review, not a production workflow.

## Evaluation

The evaluation used Gemma 4 E4B in Ollama, Whisper small, an M1 Pro with 16 GB RAM, and n8n 2.44.5. Each source contains 12 fictional customer requests.

| | v1 text | v1 audio | v2 text | v2 audio |
|---|---:|---:|---:|---:|
| Trigger correct (12) | 12 | 12 | 12 | 12 |
| Steps found (35) | 34 | 33 | 34 | 34 |
| Condition branches correct (8) | 7 | 6 | 8 | 6 |
| Imports into n8n 2.44.5 (12) | 12 | 12 | 12 | 12 |

The 12 requests are fictional. The audio is the synthetic Paulina voice from macOS; Whisper recovers 97–100% of the words, so real WhatsApp audio with background noise will perform worse. Version 2 changed the prompt after reviewing these same responses: it tells the model not to approximate unsupported catalog capabilities, such as TikTok, with `http_request`, and to put in branches only what applies in some cases. One conditional workflow was run in n8n: 60 people went to the “large” branch and 20 to the “small” branch.

The compiler sanitizes the condition field name so the model cannot inject code into n8n expressions. The response sent to the customer never asks for passwords or tokens.

### Reproduce the evaluation

```bash
sh samples/make-audio.sh
node eval/run.js --n8n <path-to-n8n>
```

## En español

La herramienta convierte pedidos de clientes en un primer borrador de flujo para n8n. Si algo no cabe en el catálogo, lo convierte en una pregunta en vez de inventar una integración.
