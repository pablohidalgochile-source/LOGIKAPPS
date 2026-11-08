import { wavPCM } from './audio.js';
const ORIGIN = 'http://127.0.0.1:43871';
let active = false, media, context, node, job, config, recordReject;
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
async function api(path, body, headers = {}) {
  const binary = body instanceof ArrayBuffer;
  const r = await fetch(`${ORIGIN}/v1/${path}`, { method: 'POST', headers: { 'X-Trackhunt-Token': config.token, 'Content-Type': binary ? 'audio/wav' : 'application/json', ...headers }, body: binary ? body : JSON.stringify(body || {}), signal: AbortSignal.timeout(50000) });
  const data = await r.json(); if (!r.ok) throw new Error(data.error || 'No se pudo consultar el asistente.'); return data;
}
async function video(action, seconds) {
  let timer;
  const result = await Promise.race([chrome.runtime.sendMessage({ target: 'worker', type: 'video', tabId: config.tabId, videoID: config.videoID, action, seconds }), new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('Chrome no respondió al controlar el video. Reanuda o usa Retomar captura interrumpida.')), 25000); })]).finally(() => clearTimeout(timer));
  if (result?.error) throw new Error(result.error); return result;
}
async function badge(text) { await chrome.runtime.sendMessage({ target: 'worker', type: 'badge', text }); }
async function cleanup() {
  active = false; recordReject?.(new Error('Captura detenida.')); recordReject = null;
  // Pause before releasing capture so the original tab never resumes audibly.
  try { await video('pause'); await video('restore', config.info); } catch {}
  node?.disconnect(); media?.getTracks().forEach(t => t.stop()); await context?.close().catch(() => {});
  media = context = node = null; await badge('');
}
function record(seconds) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { node?.port.postMessage({ type: 'discard' }); recordReject = null; reject(new Error('No llegó audio del fragmento.')); }, seconds * 1000 + 6000);
    recordReject = err => { clearTimeout(timer); reject(err); };
    node.port.onmessage = ({ data }) => { clearTimeout(timer); recordReject = null; resolve(data); };
    node.port.postMessage({ type: 'record', seconds });
  });
}
async function loop() {
  let failures = 0;
  while (active) {
    try {
      const next = await api('browser/next');
      if (next.id !== job || ['cancelled', 'complete', 'idle'].includes(next.status)) break;
      if (next.status !== 'scanning' || next.busy || next.wait > 0) { await badge(next.status === 'scanning' ? '…' : 'II'); await sleep(1000); continue; }
      await badge('REC');
      await video('seek', next.seconds);
      await context.resume();
      const begin = await video('play');
      const captured = await record(next.clipSeconds);
      const end = await video('check'); await video('pause');
      const current = await api('browser/next');
      if (current.id !== job || current.status !== 'scanning') continue;
      if (end.rate !== 1 || Math.abs(begin.time - next.seconds) > 1 || Math.abs(end.time - begin.time - next.clipSeconds) > 1.5) throw new Error(`El video no avanzó de forma continua (${(end.time - begin.time).toFixed(1)} s de ${next.clipSeconds} s). El punto queda pendiente para reanudar.`);
      let energy = 0; for (const value of captured.samples) energy += value * value;
      if (Math.sqrt(energy / captured.samples.length) < 0.00005) throw new Error('El fragmento llegó en silencio. Comprueba que YouTube tenga audio y reanuda.');
      const body = wavPCM(captured.samples, captured.rate); captured.samples = null;
      await badge('ID'); await api('browser/fragment', body, { 'X-Trackhunt-Job': job, 'X-Trackhunt-Seconds': String(next.seconds) });
      failures = 0;
    } catch (error) {
      try { await video('pause'); } catch {}
      try { await api('browser/problem', { id: job, message: error.message }); failures = 0; }
      catch { failures++; }
      await badge('!');
      if (failures >= 3) break;
      await sleep(2000);
    }
  }
  await cleanup();
}
chrome.runtime.onMessage.addListener((message, sender, respond) => {
  if (sender.id !== chrome.runtime.id || message.target !== 'offscreen') return;
  if (message.type === 'state') { respond({ active }); return; }
  if (message.type === 'stop') { cleanup().then(() => respond({ ok: true })).catch(e => respond({ error: e.message })); return true; }
  if (message.type !== 'start' || active) return;
  config = message;
  (async () => {
    media = await navigator.mediaDevices.getUserMedia({ audio: { mandatory: { chromeMediaSource: 'tab', chromeMediaSourceId: message.streamId } }, video: false });
    context = new AudioContext({ sampleRate: 48000 }); await context.audioWorklet.addModule('capture-worklet.js');
    node = new AudioWorkletNode(context, 'fragment-capture'); context.createMediaStreamSource(media).connect(node); node.connect(context.destination);
    const result = message.resume ? await api('browser/next') : await api('browser/start', { title: message.info.title, videoID: message.videoID, duration: message.info.duration, step: message.step });
    job = result.id; active = true;
    for (const track of media.getTracks()) track.onended = () => { active = false; recordReject?.(new Error('Chrome detuvo la captura. Vuelve a abrir la extensión para reanudar.')); void api('browser/problem', { id: job, message: 'La captura terminó. Abre la extensión en el mismo video y pulsa Retomar captura.' }).catch(() => {}); };
    respond({ ok: true }); void loop();
  })().catch(async error => { await cleanup(); respond({ error: error.message }); });
  return true;
});
