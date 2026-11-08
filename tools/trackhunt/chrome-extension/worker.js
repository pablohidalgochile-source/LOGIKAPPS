import { videoID } from './audio.js';
const ORIGIN = 'http://127.0.0.1:43871';
let starting = false;
async function request(path, body, token) {
  const r = await fetch(`${ORIGIN}/v1/${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { 'X-Trackhunt-Token': token } : {}) }, body: JSON.stringify(body || {}), signal: AbortSignal.timeout(8000) });
  const data = await r.json(); if (!r.ok) throw new Error(data.error || 'El asistente no respondió.'); return data;
}
async function control(tabId, id, action, seconds) {
  const result = await chrome.scripting.executeScript({ target: { tabId }, func: async (id, action, seconds) => {
    if (location.origin !== 'https://www.youtube.com' || new URL(location.href).searchParams.get('v') !== id) throw new Error('Cambió el video. Vuelve al set original antes de reanudar.');
    const video = document.querySelector('video.html5-main-video');
    if (!video) throw new Error('No se encontró el reproductor de YouTube.');
    if (action === 'pause') { video.pause(); return {}; }
    if (document.querySelector('.ad-showing, .ad-interrupting')) { video.pause(); throw new Error('YouTube muestra un anuncio. Atiéndelo en la pestaña y después reanuda.'); }
    if (!Number.isFinite(video.duration) || video.duration < 3 || video.duration > 28800) throw new Error('Espera a que cargue un video grabado de hasta 8 horas.');
    if (action === 'info') { video.pause(); return { title: document.querySelector('h1.ytd-watch-metadata')?.textContent?.trim() || document.title.replace(/ - YouTube$/, ''), duration: video.duration, originalTime: video.currentTime, muted: video.muted, volume: video.volume, rate: video.playbackRate }; }
    if (action === 'restore') { video.pause(); video.muted = seconds.muted; video.volume = seconds.volume; video.playbackRate = seconds.rate; return {}; }
    if (action === 'seek') {
      video.pause(); video.playbackRate = 1; video.muted = false; video.volume = 1;
      if (Math.abs(video.currentTime - seconds) > 0.1) {
        await new Promise((resolve, reject) => { const timer = setTimeout(() => { clean(); reject(new Error('YouTube tardó demasiado en cargar el fragmento.')); }, 20000); const clean = () => { clearTimeout(timer); video.removeEventListener('seeked', done); }; const done = () => { clean(); resolve(); }; video.addEventListener('seeked', done); video.currentTime = seconds; });
      }
      if (Math.abs(video.currentTime - seconds) > 1) throw new Error('YouTube no permitió saltar al punto solicitado.');
      return { time: video.currentTime };
    }
    if (action === 'play') { let timer; try { await Promise.race([video.play(), new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('YouTube no empezó a reproducir el fragmento a tiempo.')), 20000); })]); } catch (error) { video.pause(); throw error; } finally { clearTimeout(timer); } return { time: video.currentTime }; }
    if (action === 'check') return { time: video.currentTime, paused: video.paused, rate: video.playbackRate };
    return {};
  }, args: [id, action, seconds ?? null] });
  return result[0]?.result;
}
async function start(step, resume) {
  if (starting) throw new Error('La captura ya se está iniciando.'); starting = true;
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true }); const id = videoID(tab?.url);
    if (!id || !tab?.id) throw new Error('Abre el set en una pestaña de youtube.com/watch y pulsa la extensión allí.');
    const session = await request('session');
    if (!session.ready || !session.browserCapture) throw new Error('Abre el asistente Mac 0.3 o posterior.');
    const state = await request('status', undefined, session.token);
    if (resume && (state.sourceURL !== `https://www.youtube.com/watch?v=${id}` || !['paused', 'error'].includes(state.status))) throw new Error('Para retomar, debe existir un barrido interrumpido de este video. Si sigue activo, usa Pausar primero.');
    if (!resume && ['scanning', 'paused', 'error'].includes(state.status)) throw new Error('Ya existe un barrido. Reanúdalo o cancélalo antes de iniciar otro.');
    // Pause before releasing an old stream: never let the tab become audible during recovery.
    const info = await control(tab.id, id, 'info');
    const existing = await chrome.runtime.getContexts({ contextTypes: ['OFFSCREEN_DOCUMENT'] });
    if (existing.length) {
      let timer;
      await Promise.race([chrome.runtime.sendMessage({ target: 'offscreen', type: 'stop' }), new Promise(resolve => { timer = setTimeout(resolve, 3000); })]).catch(() => {}).finally(() => clearTimeout(timer));
      await chrome.offscreen.closeDocument();
    }
    if (resume) await request('resume', {}, session.token);
    await chrome.offscreen.createDocument({ url: 'offscreen.html', reasons: ['USER_MEDIA'], justification: 'Capturar fragmentos de 12 segundos para identificar música, sin salida de audio.' });
    const streamId = await chrome.tabCapture.getMediaStreamId({ targetTabId: tab.id });
    const response = await chrome.runtime.sendMessage({ target: 'offscreen', type: 'start', tabId: tab.id, videoID: id, streamId, token: session.token, info, step, resume });
    if (!response?.ok) throw new Error(response?.error || 'No se pudo iniciar la captura.');
    return { ok: true };
  } finally { starting = false; }
}
chrome.runtime.onMessage.addListener((message, sender, respond) => {
  if (sender.id !== chrome.runtime.id || message.target !== 'worker') return;
  const run = async () => {
    if (message.type === 'start') return start(message.step === 30 ? 30 : 60, message.resume === true);
    if (message.type === 'video') return control(message.tabId, message.videoID, message.action, message.seconds);
    if (message.type === 'badge') { await chrome.action.setBadgeText({ text: message.text }); await chrome.action.setBadgeBackgroundColor({ color: '#baff37' }); return { ok: true }; }
    if (message.type === 'status') { const s = await request('session'); return request('status', undefined, s.token); }
    if (message.type === 'command' && ['pause', 'resume', 'cancel'].includes(message.action)) { const s = await request('session'); return request(message.action, {}, s.token); }
    throw new Error('Acción desconocida.');
  };
  run().then(respond).catch(e => respond({ error: e.message || 'No se pudo conectar con el asistente Mac.' })); return true;
});
