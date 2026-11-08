import { clamp } from './patch.js';

export function parseNarration(text) {
  const clean = String(text || '').replace(/^#{1,6}\s+/gm, '').replace(/\*\*([^*]+)\*\*/g, '$1').replace(/^>\s*/gm, '');
  const parts = clean.split(/\[pausa\s+(\d+(?:\.\d+)?)s?\]/gi);
  const blocks = [];
  for (let i = 0; i < parts.length; i++) {
    if (i % 2) blocks.push({ type: 'pause', secs: clamp(parts[i], 0, 3600, 0) });
    else if (parts[i].trim()) blocks.push({ type: 'text', content: parts[i].trim() });
  }
  return blocks;
}

let blocks = [], index = 0, stopped = true, paused = false, title = '', update;
let generation = 0, timer, pauseStarted = 0, remaining = 0, utterance;
const settings = { rate: .82, volume: 1, voiceName: '' };

function getState() {
  return { playing: !stopped, paused, title, progress: blocks.length ? Math.round(index / blocks.length * 100) : 0 };
}
function publish() {
  window._ttsState = stopped ? null : getState();
  update?.();
}
function finish(error) {
  clearTimeout(timer); timer = null;
  stopped = true; paused = false; utterance = null;
  if (error) window._ttsLastError = error;
  publish();
  window._onTTSEnd?.();
}
function waitPause(token) {
  pauseStarted = performance.now();
  timer = setTimeout(() => {
    if (token !== generation || stopped || paused) return;
    remaining = 0; index++; step(token);
  }, remaining);
}
function step(token) {
  if (token !== generation || stopped || paused) return;
  if (index >= blocks.length) { finish(); return; }
  publish();
  const block = blocks[index];
  if (block.type === 'pause') { remaining = block.secs * 1000; waitPause(token); return; }
  const u = new SpeechSynthesisUtterance(block.content); utterance = u;
  u.lang = 'es-CL'; u.rate = settings.rate; u.volume = settings.volume;
  const voices = window.speechSynthesis.getVoices();
  u.voice = voices.find(v => v.name === settings.voiceName) || voices.find(v => v.lang.toLowerCase() === 'es-cl') || voices.find(v => /^es/i.test(v.lang)) || null;
  u.onend = () => { if (token === generation && !stopped) { utterance = null; index++; step(token); } };
  u.onerror = e => {
    if (token !== generation || stopped || ['canceled', 'interrupted'].includes(e.error)) return;
    finish('El sistema no pudo narrar este bloque (' + (e.error || 'voz no disponible') + ').');
  };
  window.speechSynthesis.speak(u);
}
function stop() {
  ++generation; clearTimeout(timer); timer = null;
  const wasActive = !stopped;
  stopped = true; paused = false; index = 0; utterance = null;
  window.speechSynthesis?.cancel(); publish();
  if (wasActive) window._onTTSEnd?.();
}
function speak(text, metadata = {}, options = {}) {
  if (options.backend && options.backend !== 'browser') {
    throw new Error('Este proveedor remoto todavía no está conectado. Elige Voz del sistema para narrar sin cuenta.');
  }
  if (!window.speechSynthesis || !window.SpeechSynthesisUtterance) {
    throw new Error('Este navegador no tiene narración del sistema. Puedes leer y editar el guion.');
  }
  stop(); blocks = parseNarration(text);
  if (!blocks.some(b => b.type === 'text')) throw new Error('El guion no contiene texto para narrar.');
  Object.assign(settings, { rate: clamp(options.rate ?? settings.rate, .5, 2, .82), volume: clamp(options.volume ?? settings.volume, 0, 1, 1), voiceName: options.voiceName ?? settings.voiceName });
  title = metadata.title || 'Meditación'; index = 0; stopped = false; paused = false;
  step(generation); return true;
}
function pause() {
  if (stopped || paused) return;
  paused = true;
  if (timer) { clearTimeout(timer); timer = null; remaining = Math.max(0, remaining - (performance.now() - pauseStarted)); }
  window.speechSynthesis?.pause(); publish();
}
function resume() {
  if (stopped || !paused) return;
  paused = false;
  if (blocks[index]?.type === 'pause') waitPause(generation);
  else if (utterance) window.speechSynthesis?.resume();
  else step(generation);
  publish();
}
export const narration = {
  speak, stop, pause, resume,
  toggle() { if (paused) resume(); else pause(); },
  getState,
  setUpdateCallback(fn) { update = fn; },
  setVoice(name) { settings.voiceName = name; },
  setRate(rate) { settings.rate = clamp(rate, .5, 2, .82); },
  setVolume(volume) { settings.volume = clamp(volume, 0, 1, 1); },
  async preview(backend) {
    if (backend !== 'browser') throw new Error('Proveedor remoto sin configurar. Puedes usar la voz del sistema.');
    speak('Una pausa para escuchar. Respira a tu propio ritmo.', { title: 'Prueba de voz' });
  },
};
window.NanookTTS = narration;
