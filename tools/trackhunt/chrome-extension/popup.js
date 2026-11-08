const status = document.querySelector('#status');
async function send(type, extras = {}) { const r = await chrome.runtime.sendMessage({ target: 'worker', type, ...extras }); if (r?.error) throw new Error(r.error); return r; }
async function refresh() {
  try { const s = await send('status'); status.textContent = s.status === 'idle' ? 'Asistente listo. Abre el set en YouTube y pulsa Identificar.' : `${s.fileName} · ${s.completed}/${s.total} fragmentos · ${s.tracks.length} canciones. ${s.message}`; }
  catch (e) { status.textContent = e.message; }
}
async function action(fn) { document.querySelectorAll('button').forEach(b => b.disabled = true); try { await fn(); await refresh(); } catch (e) { status.textContent = e.message; } finally { document.querySelectorAll('button').forEach(b => b.disabled = false); } }
document.querySelector('#start').onclick = () => action(() => send('start', { step: Number(document.querySelector('#step').value) }));
document.querySelector('#reattach').onclick = () => action(() => send('start', { resume: true }));
for (const actionName of ['pause', 'resume', 'cancel']) document.querySelector(`#${actionName}`).onclick = () => action(() => send('command', { action: actionName }));
void refresh(); setInterval(refresh, 2000);
