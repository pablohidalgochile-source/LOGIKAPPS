(() => {
  let busy = false, selectedId = '', comparison = null, comparisonSide = 'original', playerUrl = '';
  const message = (text, success = false) => { const el = $('#studio-notice'); el.hidden = !text; el.textContent = text; el.classList.toggle('success', success); };
  function tab(name) {
    $('#download-view').hidden = name !== 'download'; $('#studio-view').hidden = name !== 'studio';
    document.querySelectorAll('[data-tab]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.tab === name)));
  }
  document.querySelectorAll('[data-tab]').forEach(b => b.addEventListener('click', () => tab(b.dataset.tab)));
  function source() { return state.jobs.find(j => j.id === $('#enhance-source').value && j.status === 'done'); }
  function updateControls() {
    const job = source(), video = $('#enhance-target').value === 'video';
    $('#enhance-video-settings').hidden = !video; $('#enhance-audio-settings').hidden = video;
    $('#enhance-bitrate-row').hidden = !['mp3', 'm4a'].includes($('#enhance-audio-format').value);
    $('#sound-controls').hidden = !!job?.media && !job.media.audioCodec;
    $('#ai-option').disabled = !state.enhancement?.aiReady;
    if (!state.enhancement?.aiReady) $('#enhance-engine').value = 'standard';
    const ai = $('#enhance-engine').value === 'ai';
    $('#enhance-resolution option[value=source]').disabled = ai;
    if (ai && $('#enhance-resolution').value === 'source') $('#enhance-resolution').value = '1080';
    $('#ai-note').textContent = ai ? 'IA local: clips de hasta 5 minutos y tamaño máximo de 1080p. Puede tardar bastante y modificar detalles. Prueba primero una muestra. La salida conserva hasta 60 fps.' : 'Escalado estándar con proporción original. La salida no añade detalle capturado por la cámara.';
    $('#sample-button').disabled = $('#enhance-button').disabled = !job || busy || !state.enhancement?.ready;
    $('#upload-file').disabled = busy;
    $('#ai-status').textContent = state.enhancement?.aiReady ? 'IA local disponible' : 'Mejoras locales disponibles';
  }
  function chooseSource() {
    const job = source(); selectedId = job?.id || '';
    const type = job?.mediaType || 'video';
    $('#enhance-target option[value=video]').disabled = type !== 'video';
    $('#enhance-target option[value=audio]').disabled = !!job?.media && !job.media.audioCodec;
    $('#enhance-target').value = type;
    const media = job?.media;
    $('#source-info').textContent = job ? `${type === 'audio' ? 'Audio' : 'Video'} · ${duration(media?.duration || job.duration)} · ${bytes(job.bytes || 0)}${media ? ` · ${type === 'video' ? `${media.width} × ${media.height}` : `${media.audioCodec} · ${media.sampleRate} Hz`}` : ''}` : 'También puedes importar un archivo de tu Mac.';
    updateControls();
  }
  function renderSources() {
    const select = $('#enhance-source'), previous = select.value || selectedId;
    const done = state.jobs.filter(j => j.status === 'done' && j.kind !== 'preview');
    const signature = done.map(j => j.id).join(',');
    if (select.dataset.signature !== signature) {
      select.innerHTML = '<option value="">Selecciona un archivo…</option>' + done.map(j => `<option value="${escapeHTML(j.id)}">${escapeHTML(j.title)} · ${j.mediaType === 'audio' ? 'audio' : 'video'}${j.kind === 'enhance' ? ' · mejora' : ''}</option>`).join('');
      select.dataset.signature = signature; if (done.some(j => j.id === previous)) select.value = previous;
    }
    updateControls(); renderComparison();
  }
  $('#enhance-source').addEventListener('change', chooseSource);
  for (const id of ['enhance-target', 'enhance-engine', 'enhance-audio-format']) $('#' + id).addEventListener('change', updateControls);
  function options(preview) {
    return { sourceId: $('#enhance-source').value, target: $('#enhance-target').value, audioFormat: $('#enhance-audio-format').value, audioQuality: $('#enhance-audio-quality').value, resolution: $('#enhance-resolution').value, engine: $('#enhance-target').value === 'video' ? $('#enhance-engine').value : 'standard', profile: $('#audio-profile').value, normalize: $('#normalize').checked, denoiseAudio: $('#denoise-audio').checked, denoiseVideo: $('#denoise-video').checked, sharpen: $('#sharpen').checked, ...(preview ? { previewSeconds: 5 } : {}) };
  }
  async function enhance(preview) {
    if (busy || !source()) return; busy = true; updateControls(); message('');
    try {
      const job = await api('/api/enhance', options(preview)); state.jobs.unshift(job); renderJobs();
      message(preview ? 'Muestra en la cola. Cuando termine, pulsa «Comparar» en tu colección.' : 'Copia completa en la cola. Puedes seguir el progreso en tu colección.', true);
      $('#downloads-heading').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    } catch (err) { message(err.message); }
    finally { busy = false; updateControls(); }
  }
  $('#enhance-form').addEventListener('submit', e => { e.preventDefault(); void enhance(false); });
  $('#sample-button').addEventListener('click', () => enhance(true));
  function upload(file) {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest(); xhr.open('POST', `/api/upload?name=${encodeURIComponent(file.name)}`);
      xhr.setRequestHeader('X-Nanook-Token', state.token); xhr.setRequestHeader('Content-Type', 'application/octet-stream');
      xhr.upload.onprogress = e => { $('#upload-progress').textContent = e.lengthComputable ? `Importando ${Math.round(e.loaded / e.total * 100)}%…` : 'Importando…'; };
      xhr.onload = () => { try { const data = JSON.parse(xhr.responseText); if (xhr.status >= 400) reject(new Error(data.error)); else resolve(data); } catch { reject(new Error('No se pudo importar el archivo.')); } };
      xhr.onerror = () => reject(new Error('La importación se interrumpió. Vuelve a seleccionar el archivo.'));
      xhr.send(file);
    });
  }
  $('#upload-file').addEventListener('change', async e => {
    const file = e.target.files[0]; if (!file || busy) return;
    if (file.size > 2 * 1024 ** 3) { message('El archivo supera los 2 GB.'); e.target.value = ''; return; }
    busy = true; updateControls(); message('');
    try {
      state.token = (await api('/api/health')).token;
      const job = await upload(file); state.jobs.unshift(job); selectedId = job.id; renderJobs(); $('#enhance-source').value = job.id; chooseSource();
      $('#upload-progress').textContent = 'Archivo importado. Elige tus ajustes.';
    } catch (err) { message(err.message); $('#upload-progress').textContent = ''; }
    finally { busy = false; e.target.value = ''; updateControls(); }
  });
  $('#jobs').addEventListener('click', async e => {
    const button = e.target.closest('[data-enhance], [data-comparison]'); if (!button) return;
    if (button.dataset.enhance) {
      tab('studio'); selectedId = button.dataset.enhance; renderSources(); $('#enhance-source').value = selectedId; chooseSource(); $('#studio-view').scrollIntoView({ behavior: 'smooth', block: 'start' }); return;
    }
    button.disabled = true;
    try {
      const job = state.jobs.find(j => j.id === button.dataset.comparison);
      comparison = { ...(await api('/api/comparison', { jobId: job.id })), type: job.mediaType };
      comparisonSide = 'original'; playerUrl = ''; $('#comparison').hidden = false; $('#comparison-status').textContent = 'Preparando fragmentos de comparación…';
      await refreshJobs(); renderComparison(); $('#comparison').scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch (err) { tab('studio'); message(err.message); }
    finally { button.disabled = false; }
  });
  function renderComparison() {
    if (!comparison) return;
    const pair = [comparison.original, comparison.improved].map(id => state.jobs.find(j => j.id === id));
    const error = pair.find(j => j && ['error', 'cancelled'].includes(j.status));
    if (error) { $('#comparison-status').textContent = error.error || 'Comparación cancelada.'; return; }
    const ready = pair.every(j => j?.status === 'done');
    document.querySelectorAll('[data-compare]').forEach(b => { b.disabled = !ready; b.setAttribute('aria-pressed', String(b.dataset.compare === comparisonSide)); });
    if (!ready) { $('#comparison-status').textContent = 'Preparando los dos fragmentos. El trabajo continúa en la cola…'; return; }
    $('#comparison-status').textContent = comparisonSide === 'original' ? 'Original · primeros 5 segundos' : 'Mejora · primeros 5 segundos';
    const video = comparison.type === 'video', player = $(video ? '#compare-video' : '#compare-audio'), other = $(video ? '#compare-audio' : '#compare-video');
    other.pause(); other.hidden = true; player.hidden = false;
    const job = comparisonSide === 'original' ? pair[0] : pair[1];
    if (job.mediaUrl !== playerUrl) {
      const currentTime = player.currentTime || 0, playing = !player.paused; player.pause(); player.src = job.mediaUrl; playerUrl = job.mediaUrl;
      player.onloadedmetadata = () => { player.currentTime = Math.min(currentTime, Math.max(0, player.duration - .1)); if (playing) player.play().catch(() => {}); };
    }
  }
  document.querySelectorAll('[data-compare]').forEach(b => b.addEventListener('click', () => { comparisonSide = b.dataset.compare; renderComparison(); }));
  $('#close-comparison').addEventListener('click', () => { $('#comparison').hidden = true; $('#compare-video').pause(); $('#compare-audio').pause(); comparison = null; });
  document.addEventListener('nanook:jobs', renderSources); document.addEventListener('nanook:health', updateControls);
  renderSources();
})();
