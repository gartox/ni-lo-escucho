import { createApp } from './src/app.js';

const config = {
  port: Number(process.env.PORT || 3000),
  host: process.env.HOST || '127.0.0.1',
  ollamaUrl: process.env.OLLAMA_URL || 'http://127.0.0.1:11434',
  model: process.env.NI_LO_ESCUCHO_MODEL || 'gemma4:e4b-it-qat',
  whisperModel: process.env.WHISPER_MODEL || 'small',
  dataDir: process.env.DATA_DIR || './data',
  ollamaTimeoutMs: Number(process.env.OLLAMA_TIMEOUT_MS || 180000),
  elevenlabsApiKey: process.env.ELEVENLABS_API_KEY
};
const app = createApp(config);
app.listen(config.port, config.host, () => {
  console.log(`Ni lo escucho está en http://${config.host}:${config.port}`);
});
