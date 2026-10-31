const $ = selector => document.querySelector(selector);
const state = { token: null, info: null, busy: false, ready: false, jobs: [], offline: false };
const activeStates = ['queued', 'downloading', 'processing'];
const escapeHTML = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const icon = name => `<svg class="icon" aria-hidden="true"><use href="#i-${name}"/></svg>`;
const bytes = value => value >= 1024 ** 3 ? `${(value / 1024 ** 3).toFixed(2)} GB` : `${(value / 1024 ** 2).toFixed(1)} MB`;
const duration = seconds => { const s = Math.round(seconds || 0); return s >= 3600 ? `${Math.floor(s / 3600)}:${String(Math.floor(s / 60) % 60).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}` : `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
const mode = () => $('input[name=mode]:checked').value;

async function api(path, body, refreshed = false) {
  let response;
  try {
    response = await fetch(path, { method: body === undefined ? 'GET' : 'POST', headers: body === undefined ? {} : { 'Content-Type': 'application/json', 'X-Nanook-Token': state.token || '' }, body: body === undefined ? undefined : JSON.stringify(body) });
  } catch { throw new Error('La app está desconectada. Abre «INGESTA» para volver a conectarla.'); }
  if (response.status === 403 && body !== undefined && !refreshed) {
    const health = await api('/api/health');
    state.token = health.token;
    return api(path, body, true);
  }
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'No se pudo completar la operación.');
  return data;
}

function notice(message, success = false) {
  const el = $('#notice'); el.textContent = message; el.classList.toggle('success', success); el.hidden = !message;
}
function updateDownload() {
  $('#download').disabled = !state.info || !state.ready || state.busy;
  $('#analyze').disabled = !state.ready || state.busy;
}
function renderOptions() {
  const target = $('#target').value, audioFormat = $('#audio-format').value;
  $('#video-settings').hidden = target === 'audio'; $('#audio-settings').hidden = target === 'video';
  $('#audio-bitrate-row').hidden = !['mp3', 'm4a'].includes(audioFormat);
  $('#audio-note').textContent = audioFormat === 'original' ? 'Mejor pista disponible, sin volver a comprimir. Puede guardarse como Opus o M4A.' : ['wav', 'flac'].includes(audioFormat) ? 'Conserva el audio decodificado para editar o archivar. No recupera información perdida en el sitio.' : 'Esta es la calidad de exportación. Convertir a 320 kbps no mejora una fuente de menor calidad.';
  $('#source-audio').textContent = state.info?.audioFormats?.length ? `Pistas disponibles: ${state.info.audioFormats.join(' / ')}` : '';
  $('#download span').textContent = target === 'audio' ? 'Descargar audio' : target === 'both' ? 'Descargar ambos archivos' : 'Descargar video';
  $('#download-caption').textContent = target === 'both' ? 'Dos archivos independientes · Una sola cola' : target === 'audio' ? 'Solo la pista de audio · Guardado local' : state.info?.hasAudio === false ? 'Video sin sonido en la fuente · Guardado local' : 'Video y audio incluidos · Guardado local';
  const compatible = mode() === 'mp4';
  const conversion = compatible && state.info && !state.info.mp4Heights.length;
  const heights = state.info ? (compatible && !conversion ? state.info.mp4Heights : state.info.heights) : [];
  const supported = [4320, 2160, 1440, 1080, 720, 480, 360, 240, 144].filter(h => heights.includes(h));
  $('#quality').innerHTML = '<option value="best">La mejor disponible</option>' + supported.map(h => `<option value="${h}">Hasta ${h === 4320 ? '8K · ' : h === 2160 ? '4K · ' : ''}${h}p</option>`).join('');
  $('#quality-note').textContent = compatible
    ? conversion ? 'La fuente necesita conversión a MP4. Se mantiene su resolución disponible, con una nueva compresión para abrirla en más reproductores.' : 'MP4 usa H.264 y AAC sin recodificar. Su resolución puede ser menor que la calidad original.'
    : 'Se conserva la calidad de la fuente. Hasta 4K u 8K cuando el video lo ofrezca.';
}
document.querySelectorAll('input[name=mode]').forEach(input => input.addEventListener('change', renderOptions));
$('#target').addEventListener('change', renderOptions);
$('#audio-format').addEventListener('change', renderOptions);

$('#paste').addEventListener('click', async () => {
  try { $('#url').value = (await navigator.clipboard.readText()).trim(); $('#url').dispatchEvent(new Event('input')); $('#url').focus(); }
  catch { notice('Pega el enlace con ⌘V en el campo del video.'); $('#url').focus(); }
});
$('#url').addEventListener('input', () => {
  let host='';try{host=new URL(($('#url').value.match(/https?:\/\/[^\s<>"'\[\]()]+/i)||[])[0]).hostname;}catch{}
  const names=[['instagram.com','Instagram'],['tiktok.com','TikTok'],['youtube.com','YouTube'],['youtu.be','YouTube'],['facebook.com','Facebook'],['fb.watch','Facebook'],['vimeo.com','Vimeo'],['x.com','X / Twitter'],['twitter.com','X / Twitter']];
  const detected=names.find(([domain])=>host===domain||host.endsWith('.'+domain))?.[1];
  $('#source-hint').textContent=detected?`${detected} detectado. Se consultarán los formatos que la publicación permita descargar.`:'Detección automática de la plataforma. Usa el enlace de la publicación, Reel o video público.';
  $('#target option[value=audio]').disabled=false;$('#target option[value=video]').textContent='Video con audio';
  if (state.info) {
    state.info = null; $('#target option[value=video]').disabled=false;$('#target option[value=both]').disabled=false; $('#video-details').hidden = true; $('#video-empty').hidden = false;
    $('input[value=mp4]').disabled = false; renderOptions();
    $('#download-caption').textContent = 'Analiza el nuevo enlace para comenzar'; updateDownload();
  }
});

$('#analyze-form').addEventListener('submit', async event => {
  event.preventDefault();
  if (state.busy) return;
  state.busy = true; state.info = null; notice(''); updateDownload();
  $('#url').readOnly = true; $('#paste').disabled = true;
  $('.workspace').classList.add('is-loading'); $('#analyze span').textContent = 'Analizando…';
  $('#video-details').hidden = true; $('#video-empty').hidden = false;
  $('#video-empty strong').textContent = 'Buscando la mejor calidad';
  $('#download-caption').textContent = 'Consultando los formatos disponibles…';
  try {
    const info = await api('/api/analyze', { url: $('#url').value });
    state.info = info; $('#url').value=info.url; $('#source-hint').textContent=`${info.platform||info.source} · ${info.hasAudio===false?'Esta publicación no incluye sonido.':'Puedes guardar video, audio o ambos por separado.'}`;
    $('#thumbnail').hidden=!info.thumbnail; $('#thumbnail').src = info.thumbnail||'/favicon.svg'; $('#thumbnail').alt = `Miniatura de ${info.title}`;
    $('#video-title').textContent = info.title; $('#video-channel').textContent = info.channel;
    $('#duration').textContent = info.duration?duration(info.duration):'Duración al descargar'; $('#resolution').textContent=info.width&&info.height?`${info.width} × ${info.height}`:info.maxHeight?`${info.maxHeight}p disponible`:info.hasVideo?'Resolución al descargar':'Solo audio';
    $('#target option[value=video]').disabled=info.hasVideo===false;$('#target option[value=both]').disabled=info.hasVideo===false||info.hasAudio===false;
    $('#target option[value=audio]').disabled=info.hasAudio===false;
    $('#target option[value=video]').textContent=info.hasAudio===false?'Video sin audio (fuente silenciosa)':'Video con audio';
    if(info.hasAudio===false)$('#target').value='video';
    if(info.hasVideo===false)$('#target').value='audio';
    $('#video-empty').hidden = true; $('#video-details').hidden = false;
    $('input[value=mp4]').disabled = info.hasVideo === false;
    renderOptions();
    notice(info.hasAudio===false?'Enlace listo. Esta publicación no incluye sonido; puedes descargar el video.':info.hasVideo===false?'Enlace listo. Elige el formato de audio y la calidad de salida.':'Enlace listo. Elige audio, video o ambos y la calidad de salida.', true);
  } catch (err) { notice(err.message); $('#download-caption').textContent = 'Revisa el enlace e inténtalo nuevamente'; }
  finally {
    state.busy = false; updateDownload(); $('#url').readOnly = false; $('#paste').disabled = false;
    $('.workspace').classList.remove('is-loading'); $('#analyze span').textContent = 'Analizar enlace';
    $('#video-empty strong').textContent = 'Todo empieza con un enlace';
  }
});

$('#download').addEventListener('click', async () => {
  if (!state.info || state.busy) return;
  state.busy = true; updateDownload();
  try {
    const result = await api('/api/jobs', { analysisId: state.info.analysisId, target: $('#target').value, mode: mode(), quality: $('#quality').value, audioFormat: $('#audio-format').value, audioQuality: $('#audio-quality').value });
    state.jobs.unshift(...(result.jobs || [result])); renderJobs();
    notice('Descarga añadida. Puedes seguir su progreso más abajo.', true);
    $('#downloads-heading').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  } catch (err) { notice(err.message); }
  finally { state.busy = false; updateDownload(); }
});

let jobsShown = 50;
$('#jobs-filter').addEventListener('change',()=>{jobsShown=50;renderJobs();});
$('#jobs-more').addEventListener('click',()=>{jobsShown+=50;renderJobs();});
function renderJobs() {
  const allJobs = state.jobs.filter(j => j.kind !== 'preview');
  const filter = $('#jobs-filter').value;
  const matches = allJobs.filter(j=>filter==='all'||(filter==='active'?activeStates.includes(j.status):j.status===filter));
  // Active work remains visible above completed history in the full collection.
  const ordered = filter==='all' ? [...matches.filter(j=>activeStates.includes(j.status)),...matches.filter(j=>!activeStates.includes(j.status))] : matches;
  const visibleJobs = ordered.slice(0,jobsShown);
  $('#count').textContent = String(allJobs.length);
  $('#downloads-empty').hidden = matches.length > 0;
  $('#jobs-more').hidden = matches.length<=jobsShown;
  $('#jobs-visible-count').textContent = `${visibleJobs.length} de ${matches.length}`;
  $('#folder-note').hidden = !state.jobs.some(j => j.status === 'done');
  const focusedAction = document.activeElement?.dataset.cancel ? 'cancel' : 'retry';
  const focusId = document.activeElement?.dataset[focusedAction];
  $('#jobs').innerHTML = visibleJobs.map(job => {
    const labels = { queued: 'En espera', downloading: job.stage || 'Descargando', processing: job.stage || 'Procesando', done: 'Lista', error: 'No se completó', cancelled: 'Cancelada' };
    const running = activeStates.includes(job.status);
    const progress = job.progress == null ? '' : ` · ${job.progress}% de esta pista`;
    const speed = job.speed && job.status === 'downloading' ? ` · ${bytes(job.speed)}/s` : '';
    const eta = job.eta && job.status === 'downloading' ? ` · ${duration(job.eta)} restantes` : '';
    const audioLabel = job.audioFormat === 'original' || !job.audioFormat ? 'Audio original' : `${job.audioFormat.toUpperCase()}${['mp3','m4a'].includes(job.audioFormat) ? ` · ${job.audioQuality} kbps` : ''}`;
    const actual = job.media ? `${job.mediaType === 'audio' ? `${job.media.audioCodec}${job.media.audioBitrate ? ` · ${job.media.audioBitrate} kbps` : ''}` : `${job.media.width} × ${job.media.height}`} · ${duration(job.media.duration)}` : '';
    const info = (job.batchName ? `${job.batchName} · ` : '') + (job.kind === 'upload' ? `Importado · ${actual}` : job.kind === 'enhance' ? `${job.options.previewSeconds ? 'Muestra · ' : 'Copia · '}${job.options.engine === 'ai' ? 'IA local · ' : ''}${actual}` : job.mode === 'audio' ? `${audioLabel}${actual ? ` · ${actual}` : ''}` : `${job.mode === 'original' ? 'MKV original' : 'MP4 compatible'} · ${actual || (job.quality === 'best' ? 'Mejor calidad disponible' : `Hasta ${job.quality}p`)}`);
    return `<article class="job" data-job-id="${escapeHTML(job.id)}" aria-label="${escapeHTML(job.title)}">${job.thumbnail ? `<img src="${escapeHTML(job.thumbnail)}" alt="" loading="lazy">` : `<div class="job-media-mark" aria-hidden="true">${job.mediaType === 'audio' ? '♫' : '▶'}</div>`}<div class="job-body"><h3 class="job-title">${escapeHTML(job.title)}</h3>${job.source?`<span class="job-source">${escapeHTML(job.platform||job.source)}</span>`:''}<div class="job-info"><span class="job-state ${escapeHTML(job.status)}">${escapeHTML(labels[job.status] || job.status)}${running && job.progress != null ? escapeHTML(progress.replace(' de esta pista', job.kind === 'enhance' ? '' : ' de esta pista') + speed + eta) : ''}</span><span>${escapeHTML(info)}${job.bytes ? ` · ${bytes(job.bytes)}` : ''}</span></div>${job.error || job.note ? `<p class="job-error">${escapeHTML(job.error || job.note)}</p>` : ''}${running ? `<div class="progress-track ${job.progress == null ? 'indeterminate' : ''}" role="progressbar" aria-label="Progreso del trabajo" aria-valuemin="0" aria-valuemax="100" ${job.progress != null ? `aria-valuenow="${job.progress}"` : ''}><div class="progress-bar" style="width:${Math.max(0, Math.min(100, Number(job.progress) || 0))}%"></div></div>` : ''}</div><div class="job-actions">${job.fileUrl ? `<a class="small-button" href="${escapeHTML(job.fileUrl)}" download>${icon('download')} Guardar</a>${job.url?`<button class="small-button" data-related-job="${escapeHTML(job.id)}">Relacionados</button>`:''}<button class="small-button" data-enhance="${escapeHTML(job.id)}">Mejorar</button>${job.kind === 'enhance' ? `<button class="small-button" data-comparison="${escapeHTML(job.id)}">Comparar</button>` : ''}` : running ? `<button class="cancel-button" data-cancel="${escapeHTML(job.id)}" aria-label="Cancelar descarga de ${escapeHTML(job.title)}">${icon('close')}</button>` : ['error', 'cancelled'].includes(job.status) ? `<button class="small-button" data-retry="${escapeHTML(job.id)}" aria-label="Reintentar descarga de ${escapeHTML(job.title)}">Reintentar</button>` : ''}</div></article>`;
  }).join('');
  if (focusId) document.querySelector(`[data-${focusedAction}="${CSS.escape(focusId)}"]`)?.focus({ preventScroll: true });
  document.dispatchEvent(new Event('nanook:jobs'));
}
$('#jobs').addEventListener('click', async event => {
  const button = event.target.closest('[data-cancel], [data-retry]');
  if (!button) return;
  button.disabled = true;
  try {
    const action = button.dataset.retry ? 'retry' : 'cancel';
    const id = button.dataset.retry || button.dataset.cancel;
    await api(`/api/jobs/${id}/${action}`, {});
    await refreshJobs();
    if (action === 'retry') notice('Descarga reiniciada con un enlace actualizado.', true);
  }
  catch (err) { notice(err.message); button.disabled = false; }
});

let signature = '';
async function refreshJobs() {
  const [jobs,queue] = await Promise.all([api('/api/jobs'),api('/api/queue')]);
  state.queue=queue;document.dispatchEvent(new Event('nanook:queue'));
  const next = JSON.stringify(jobs);
  if (next !== signature) { signature = next; state.jobs = jobs; renderJobs(); }
}
let connectionNotice = '';
async function connect() {
  try {
    const health = await api('/api/health');
    state.token = health.token; state.ready = health.ready; state.offline = false;
    state.enhancement = health.enhancement;
    document.dispatchEvent(new Event('nanook:health'));
    $('#connection').textContent = health.ready ? 'Conexión local' : 'Revisar instalación';
    $('#connection').classList.toggle('offline', !health.ready);
    $('#folder-note').textContent = `Carpeta de los originales: ${health.downloadFolder}`;
    if (!health.ready) {
      connectionNotice = health.dependencyMessage || 'El motor no respondió. Ingesta volverá a comprobarlo automáticamente en unos segundos.';
      notice(connectionNotice);
    } else if (connectionNotice) {
      if ($('#notice').textContent === connectionNotice) notice('');
      connectionNotice = '';
    }
    await refreshJobs();
  } catch (err) {
    state.ready = false; state.offline = true; $('#connection').textContent = 'Desconectada'; $('#connection').classList.add('offline'); connectionNotice = err.message; notice(connectionNotice);
  }
  updateDownload();
}
async function poll() {
  try {
    if (state.offline || !state.ready) await connect();
    else await refreshJobs();
  } catch {
    state.offline = true; state.ready = false; $('#connection').textContent = 'Desconectada'; $('#connection').classList.add('offline'); updateDownload();
  }
  setTimeout(poll, state.jobs.some(j => activeStates.includes(j.status)) ? 1000 : 4000);
}
connect().then(() => setTimeout(poll, 1500));
