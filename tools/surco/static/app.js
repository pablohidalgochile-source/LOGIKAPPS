(() => {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const state = {
    token: null, connected: false, ffmpeg: false, ytDlp: false,
    recordings: [], inspection: null, inspecting: false, downloading: false,
    mode: 'link', phase: 'idle', captureEpoch: 0, stream: null,
    audioStream: null, recorder: null, audioContext: null, analyser: null,
    chunks: [], blob: null, objectUrl: null, saved: false,
    originalDownloaded: false, startedAt: 0, duration: 0, raf: 0, chunkBytes: 0,
    formatInitialized: false,
    lastSignalAt: 0, stopPromise: null, stopResolve: null,
    pendingRecordError: '', toastTimer: null, currentPlayer: null,
    albumJob: null, albumJobId: null, albumPreference: 'mp3', albumPolling: false,
    albumLaunching: false, albumInterrupted: false, albumCancelPending: false,
  };
  const albumStorageKey = 'surco.album-download';
  const albumTerminalStates = new Set(['complete', 'partial', 'error', 'cancelled']);
  const collectionCopy = (item) => item?.collection_type === 'playlist'
    ? { object: 'la lista', of: 'de la lista', this: 'esta lista', capital: 'La lista', ready: 'Tu lista está lista', saved: 'Lista guardada', button: 'Descargar lista completa' }
    : { object: 'el álbum', of: 'del álbum', this: 'este álbum', capital: 'El álbum', ready: 'Tu álbum está listo', saved: 'Álbum guardado', button: 'Descargar álbum completo' };
  const bars = [...$('audio-meter').children];
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const activePhases = ['requesting', 'recording', 'stopping'];

  const text = (id, value) => { $(id).textContent = value; };
  const show = (id, visible = true) => { $(id).hidden = !visible; };
  const errorMessage = (error) => error instanceof Error ? error.message : String(error);
  const hasUnsavedAudio = () => Boolean(state.blob && !state.saved && !state.originalDownloaded);
  const safeUrl = (value) => {
    try {
      const url = new URL(value);
      return ['https:', 'http:'].includes(url.protocol) ? url.href : '';
    } catch { return ''; }
  };
  const fileUrl = (recording, download = false) => `/files/${encodeURIComponent(recording.id)}${download ? '?download=1' : ''}`;
  const formatBytes = (bytes) => {
    if (!Number.isFinite(Number(bytes))) return '';
    const size = Number(bytes);
    return size < 1024 * 1024 ? `${Math.max(1, Math.round(size / 1024))} KB` : `${(size / (1024 * 1024)).toFixed(1)} MB`;
  };
  const formatDuration = (seconds) => {
    if (!Number.isFinite(Number(seconds)) || Number(seconds) < 0) return '';
    const s = Math.floor(Number(seconds));
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  };
  const friendlyDate = (value) => {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? '' : new Intl.DateTimeFormat('es', { day: 'numeric', month: 'short' }).format(date);
  };
  function notice(id, message) {
    text(id, message);
    show(id, Boolean(message));
  }
  function toast(message) {
    clearTimeout(state.toastTimer);
    text('toast', message);
    show('toast');
    state.toastTimer = setTimeout(() => show('toast', false), 5500);
  }
  function busy(button, active, label) {
    button.disabled = active;
    button.classList.toggle('busy', active);
    button.setAttribute('aria-busy', String(active));
    if (label) button.textContent = label;
  }
  async function api(path, options = {}) {
    const headers = new Headers(options.headers || {});
    if (options.method && options.method !== 'GET') {
      if (!state.token) throw new Error('No hay conexión con Surco. Reconecta para guardar; tu grabación sigue disponible para descargar como WebM.');
      headers.set('X-Local-Token', state.token);
    }
    let response;
    try { response = await fetch(path, { ...options, headers, cache: 'no-store' }); }
    catch { throw new Error('No pudimos conectar con Surco. Comprueba que la herramienta local siga abierta.'); }
    let data;
    try { data = await response.json(); }
    catch { throw new Error('Surco devolvió una respuesta inesperada. Inténtalo de nuevo.'); }
    if (!response.ok) {
      const error = new Error(data.error || `No se pudo completar la acción (${response.status}).`);
      error.status = response.status;
      throw error;
    }
    return data;
  }
  const post = (path, data) => api(path, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data),
  });

  async function connect() {
    $('retry-connection').disabled = true;
    text('connection-label', 'Conectando…');
    try {
      const info = await api('/api/status');
      if (!info.token) throw new Error('La conexión local no devolvió una sesión válida.');
      state.token = info.token;
      state.connected = true;
      state.ffmpeg = Boolean(info.ffmpeg);
      state.ytDlp = Boolean(info.yt_dlp);
      const platforms = [...new Set((Array.isArray(info.platforms) ? info.platforms : []).filter((name) => typeof name === 'string' && name.trim()).map((name) => name.trim()))];
      $('platforms-list').replaceChildren();
      for (const name of platforms) {
        const badge = document.createElement('span');
        badge.className = 'platform-badge';
        badge.textContent = name;
        $('platforms-list').append(badge);
      }
      show('platforms-section', platforms.length > 0);
      state.recordings = Array.isArray(info.recordings) ? info.recordings : [];
      text('connection-label', 'Todo queda en local');
      $('connection-dot').className = 'status-dot connected';
      show('connection-error', false);
      text('directory-label', info.directory ? `Tu carpeta · ${info.directory}` : '');
      $('directory-label').title = info.directory || '';
      for (const option of $('record-format').options) option.disabled = option.value !== 'webm' && !state.ffmpeg;
      if (!state.ffmpeg) {
        $('record-format').value = 'webm';
        text('conversion-hint', 'Por ahora puedes guardar WebM, el audio original de la grabación. MP3 y FLAC necesitan FFmpeg.');
      } else {
        text('conversion-hint', 'MP3 y FLAC se crean a partir de lo grabado. Convertir a FLAC no mejora la calidad del audio de origen.');
        if (!state.formatInitialized) $('record-format').value = 'mp3';
      }
      state.formatInitialized = true;
      if (!state.ytDlp) notice('inspect-error', 'La lectura de enlaces necesita completar la instalación de yt-dlp. Puedes usar «Grabar una pestaña» mientras tanto.');
      else if (!state.inspection) notice('inspect-error', '');
      renderLibrary();
      restoreAlbumJob();
    } catch (error) {
      state.connected = false;
      state.token = null;
      text('connection-label', 'Sin conexión local');
      $('connection-dot').className = 'status-dot offline';
      text('connection-error-text', `${errorMessage(error)} Aún puedes grabar una pestaña y descargar el WebM original.`);
      show('connection-error');
    } finally {
      $('retry-connection').disabled = false;
      updateDownloadControls();
      updateCaptureUi();
    }
  }

  async function switchMode(mode) {
    if (mode === state.mode) return;
    if (state.phase === 'requesting') await stopRecording();
    state.mode = mode;
    for (const current of ['link', 'record']) {
      const selected = current === mode;
      $(`${current}-tab`).classList.toggle('active', selected);
      $(`${current}-tab`).setAttribute('aria-selected', String(selected));
      $(`${current}-tab`).tabIndex = selected ? 0 : -1;
      show(`${current}-panel`, selected);
    }
    $(`${mode}-tab`).focus();
  }
  $('link-tab').addEventListener('click', () => switchMode('link'));
  $('record-tab').addEventListener('click', () => switchMode('record'));
  document.querySelector('.mode-tabs').addEventListener('keydown', (event) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    switchMode(event.key === 'Home' ? 'link' : event.key === 'End' ? 'record' : state.mode === 'link' ? 'record' : 'link');
  });

  $('inspect-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    await inspectUrl($('bandcamp-url').value);
  });
  async function inspectUrl(value) {
    if (state.inspecting || state.downloading) return;
    const url = safeUrl(value.trim());
    if (!url) { notice('inspect-error', 'Pega un enlace completo que empiece por https://.'); return; }
    state.inspecting = true;
    resetAlbumJob();
    state.inspection = null;
    notice('inspect-error', '');
    notice('inspect-notice', '');
    notice('download-error', '');
    show('inspect-result', false);
    show('inspect-empty', false);
    busy($('inspect-button'), true, 'Revisando enlace');
    try {
      const item = await post('/api/inspect', { url });
      state.inspection = item;
      renderInspection(item);
    } catch (error) {
      notice('inspect-error', `${errorMessage(error)} La grabación de pestaña funciona de forma independiente.`);
      show('inspect-empty');
    } finally {
      state.inspecting = false;
      busy($('inspect-button'), false, 'Explorar enlace ↗');
      updateDownloadControls();
    }
  }
  function renderInspection(item) {
    const collection = collectionCopy(item);
    const platform = typeof item.platform === 'string' ? item.platform.trim() : '';
    const typeLabel = item.kind === 'album' ? item.collection_type === 'playlist' ? 'LISTA' : 'ÁLBUM' : 'CANCIÓN';
    text('release-type', `${typeLabel}${platform ? ` · ${platform.toLocaleUpperCase('es')}` : ''}`);
    notice('inspect-notice', typeof item.notice === 'string' ? item.notice : '');
    text('release-title', item.title || 'Sin título');
    text('release-artist', item.artist || 'Artista sin identificar');
    const details = [item.kind !== 'album' ? item.album : '', item.duration ? formatDuration(item.duration) : ''].filter(Boolean);
    text('release-details', details.join(' · '));
    const source = safeUrl(item.source_url || $('bandcamp-url').value);
    $('release-source').href = source || '#';
    $('release-source').hidden = !source;
    $('release-source').setAttribute('aria-label', platform ? `Abrir publicación en ${platform}` : 'Abrir publicación original');
    $('download-format').replaceChildren();
    const formats = Array.isArray(item.formats) ? item.formats : [];
    for (const format of formats) {
      const option = document.createElement('option');
      option.value = format.id;
      const originLabel = { official: 'Descarga oficial', stream: 'Audio de escucha', available: 'Archivo disponible' }[format.origin] || 'Archivo disponible';
      option.textContent = format.label || `${(format.ext || 'audio').toUpperCase()} · ${originLabel}`;
      $('download-format').append(option);
    }
    show('download-options', formats.length > 0);
    show('no-formats', formats.length === 0);
    updateFormatDescription();
    $('track-list').replaceChildren();
    const tracks = Array.isArray(item.tracks) ? item.tracks : [];
    const hasAlbumTracks = item.kind === 'album' && tracks.length > 0;
    show('album-download', hasAlbumTracks);
    text('album-download-title', `${collection.capital}, pista a pista.`);
    text('album-download-button', `${collection.button} ↓`);
    text('collection-format-note', `Cada canción se guarda numerada en la misma carpeta ${collection.of}. La opción MP3 prioriza ese formato cuando está disponible; si no, conservamos el formato de origen. «Mejor calidad» elige el mejor audio disponible sin aumentar la calidad de la fuente.`);
    $('album-progress-bar').setAttribute('aria-label', `Progreso ${collection.of}`);
    text('album-resume-button', `Recuperar seguimiento ${collection.of} ↗`);
    text('album-download-count', `${tracks.length} ${tracks.length === 1 ? 'pista' : 'pistas'}`);
    show('no-formats', formats.length === 0 && !hasAlbumTracks);
    show('album-tracks', item.kind === 'album' && tracks.length > 0);
    $('album-tracks').open = item.kind === 'album' && tracks.length > 0;
    text('no-formats', item.kind === 'album' && tracks.length
      ? `Elige una canción ${collection.of} para ver el audio disponible.`
      : 'No encontramos una descarga disponible. Si puedes reproducirlo en Chrome, puedes grabar el audio de esa pestaña.');
    text('album-track-summary', `${tracks.length} ${tracks.length === 1 ? 'canción' : 'canciones'} en ${collection.this}`);
    tracks.forEach((track, index) => {
      const row = document.createElement('li');
      const number = document.createElement('span');
      number.className = 'track-number';
      number.textContent = String(index + 1).padStart(2, '0');
      const name = document.createElement('span');
      name.className = 'track-name';
      name.textContent = track.title || `Canción ${index + 1}`;
      const duration = document.createElement('span');
      duration.className = 'track-duration';
      duration.textContent = track.duration ? formatDuration(track.duration) : '';
      row.append(number, name, duration);
      if (safeUrl(track.url)) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'text-button';
        button.dataset.exploreTrack = 'true';
        button.textContent = 'Explorar ↗';
        button.addEventListener('click', () => {
          if (state.downloading || state.inspecting) return;
          $('bandcamp-url').value = track.url;
          inspectUrl(track.url);
        });
        row.append(button);
      } else {
        const unavailable = document.createElement('span');
        unavailable.className = 'track-duration';
        unavailable.textContent = 'Sin enlace disponible';
        row.append(unavailable);
      }
      $('track-list').append(row);
    });
    if (!state.blob && !activePhases.includes(state.phase)) {
      if (!$('record-title').value) $('record-title').value = item.title || '';
      if (!$('record-artist').value) $('record-artist').value = item.artist || '';
      if (!$('record-album').value) $('record-album').value = item.album || (item.kind === 'album' ? item.title : '') || '';
      if (!$('record-source').value) $('record-source').value = source;
    }
    show('download-progress', false);
    show('inspect-result');
    updateDownloadControls();
  }
  function updateFormatDescription() {
    const format = state.inspection?.formats?.find((item) => String(item.id) === $('download-format').value);
    text('format-description', !format ? '' : format.origin === 'official'
      ? 'Archivo ofrecido como descarga gratuita oficial. Se guarda en el formato disponible.'
      : format.origin === 'available' ? 'Archivo disponible en esta publicación. Se guarda en el formato ofrecido, sin aumentar la calidad de la fuente.'
      : 'Audio disponible para escuchar en la página. Puede tener menor calidad que la descarga oficial; conservarlo en FLAC no añade calidad.');
  }
  $('download-format').addEventListener('change', updateFormatDescription);
  $('download-button').addEventListener('click', async () => {
    if (!state.inspection || state.downloading) return;
    const itemId = state.inspection.item_id;
    const formatId = $('download-format').value;
    if (!formatId) return;
    state.downloading = true;
    updateDownloadControls();
    busy($('download-button'), true, 'Guardando audio');
    $('inspect-button').disabled = true;
    $('download-format').disabled = true;
    notice('download-error', '');
    show('download-progress');
    text('download-status', 'Preparando descarga…');
    text('download-percent', '');
    $('download-progress-bar').removeAttribute('value');
    try {
      const { job_id: id } = await post('/api/download', { item_id: itemId, format_id: formatId });
      let failures = 0;
      while (true) {
        let job;
        try { job = await api(`/api/jobs/${encodeURIComponent(id)}`); failures = 0; }
        catch (error) {
          if (++failures >= 4) throw error;
          text('download-status', 'Intentando recuperar la conexión…');
          await new Promise((resolve) => setTimeout(resolve, 2000));
          continue;
        }
        if (job.status === 'error') throw new Error(job.error || 'La descarga no se pudo completar.');
        if (job.status === 'complete') {
          $('download-progress-bar').value = 100;
          text('download-status', 'Guardado en tu biblioteca');
          text('download-percent', '100 %');
          if (job.recording) addRecording(job.recording);
          await refreshLibrary(false);
          toast('Audio guardado. Ya está en tu biblioteca.');
          break;
        }
        text('download-status', job.status === 'queued' ? 'Preparando descarga…' : 'Descargando y preparando el archivo…');
        const progress = Math.max(0, Math.min(100, Number(job.progress) || 0));
        if (progress > 0) {
          $('download-progress-bar').value = progress;
          text('download-percent', `${Math.round(progress)} %`);
        } else {
          $('download-progress-bar').removeAttribute('value');
          text('download-percent', '');
        }
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    } catch (error) {
      notice('download-error', errorMessage(error));
      show('download-progress', false);
    } finally {
      state.downloading = false;
      busy($('download-button'), false, 'Guardar en biblioteca ↓');
      updateDownloadControls();
    }
  });

  function updateDownloadControls() {
    const blocked = state.downloading || state.inspecting;
    $('inspect-button').disabled = blocked || !state.connected || !state.ytDlp;
    $('bandcamp-url').disabled = state.downloading;
    $('download-button').disabled = blocked || !state.connected;
    $('download-format').disabled = blocked;
    $('album-preference').disabled = blocked || Boolean(state.albumJob);
    $('album-download-button').disabled = blocked || !state.connected;
    $('album-download-button').classList.toggle('busy', state.albumLaunching);
    show('album-download-button', !state.albumJob);
    $('album-retry-button').disabled = blocked || !state.connected;
    $('album-resume-button').disabled = state.albumPolling || !state.connected;
    document.querySelectorAll('[data-explore-track]').forEach((button) => { button.disabled = blocked; });
  }
  function storeAlbumJob() {
    try {
      if (state.albumJobId) localStorage.setItem(albumStorageKey, JSON.stringify({ id: state.albumJobId, preference: state.albumPreference }));
      else localStorage.removeItem(albumStorageKey);
    } catch { /* Downloading still works when local storage is unavailable. */ }
  }
  function resetAlbumJob() {
    state.albumJob = null;
    state.albumJobId = null;
    state.albumInterrupted = false;
    state.albumCancelPending = false;
    storeAlbumJob();
    show('album-job', false);
    show('album-summary', false);
    show('album-retry-button', false);
    show('album-resume-button', false);
    show('album-cancel-button', false);
    notice('album-job-error', '');
    $('album-job-tracks').replaceChildren();
    $('album-failures').replaceChildren();
  }
  function restoreAlbumContext(job) {
    if (!job.album) return;
    state.inspection = job.album;
    $('bandcamp-url').value = job.album.source_url || '';
    renderInspection(job.album);
    show('inspect-empty', false);
    $('album-tracks').open = false;
    $('album-preference').value = state.albumPreference;
  }
  async function restoreAlbumJob() {
    if (state.albumPolling || state.albumLaunching || (state.downloading && !state.albumJobId)) return;
    let saved;
    try { saved = JSON.parse(localStorage.getItem(albumStorageKey) || 'null'); }
    catch { saved = null; }
    const id = state.albumJobId || saved?.id;
    if (!id || typeof id !== 'string') return;
    state.albumJobId = id;
    state.albumPreference = saved?.preference === 'best' ? 'best' : state.albumPreference;
    state.downloading = true;
    state.albumPolling = true;
    updateDownloadControls();
    try {
      const job = await api(`/api/jobs/${encodeURIComponent(id)}`);
      if (job.kind !== 'album') throw Object.assign(new Error('La descarga guardada ya no está disponible.'), { status: 404 });
      state.albumJob = job;
      restoreAlbumContext(job);
      state.albumPolling = false;
      followAlbumJob(id, job);
    } catch (error) {
      state.albumPolling = false;
      if (error.status === 404 || error.status === 410) {
        state.downloading = false;
        resetAlbumJob();
        notice('inspect-error', 'La descarga anterior ya no está disponible para consultar. Explora el enlace de nuevo; los archivos guardados siguen en tu biblioteca.');
      } else {
        state.albumInterrupted = true;
        notice('inspect-error', `${errorMessage(error)} Conservamos el seguimiento de la descarga; pulsa «Reconectar» para recuperarlo.`);
        text('connection-error-text', 'No pudimos recuperar el seguimiento. Reconecta para consultar cómo va la descarga.');
        show('connection-error');
        if (state.albumJob) { show('album-resume-button'); notice('album-job-error', errorMessage(error)); }
      }
      updateDownloadControls();
    }
  }
  async function startAlbumDownload(retry = false) {
    if (state.downloading || state.inspecting || !state.inspection) return;
    const album = retry ? state.albumJob?.album || state.inspection : state.inspection;
    if (album.kind !== 'album' || !album.tracks?.length) return;
    const preference = retry ? state.albumPreference : $('album-preference').value;
    state.albumPreference = preference === 'best' ? 'best' : 'mp3';
    state.downloading = true;
    state.albumLaunching = true;
    state.albumInterrupted = false;
    state.albumCancelPending = false;
    notice('album-job-error', '');
    show('album-retry-button', false);
    show('album-resume-button', false);
    updateDownloadControls();
    try {
      const response = await post('/api/download-album', { item_id: album.item_id, preference: state.albumPreference });
      if (!response.job_id) throw new Error('No recibimos el identificador de la descarga. Inténtalo de nuevo.');
      state.albumJobId = response.job_id;
      storeAlbumJob();
      state.albumJob = { kind: 'album', album, status: 'queued', progress: 0, total: album.tracks.length, completed: 0, failed: 0, existing: 0, tracks: album.tracks.map((track, index) => ({ ...track, number: index + 1, status: 'queued', progress: 0 })) };
      $('album-tracks').open = false;
      renderAlbumJob(state.albumJob);
      state.albumLaunching = false;
      followAlbumJob(state.albumJobId);
    } catch (error) {
      state.downloading = false;
      state.albumLaunching = false;
      notice('album-job-error', errorMessage(error));
      if (retry) show('album-retry-button');
    } finally { updateDownloadControls(); }
  }
  function renderAlbumJob(job) {
    state.albumJob = job;
    const collection = collectionCopy(job.album);
    const terminal = albumTerminalStates.has(job.status);
    const tracks = Array.isArray(job.tracks) ? job.tracks : [];
    const total = Math.max(0, Number(job.total) || tracks.length);
    const completed = Math.max(0, Number(job.completed) || 0);
    const existing = Math.max(0, Number(job.existing) || 0);
    const failed = Math.max(0, Number(job.failed) || 0);
    const progress = Math.max(0, Math.min(100, Number(job.progress) || 0));
    const allSaved = total > 0 && completed === total && failed === 0 && tracks.length === total && tracks.every((track) => ['complete', 'existing'].includes(track.status));
    show('album-job');
    text('album-job-status', terminal
      ? job.status === 'cancelled' ? `Descarga ${collection.of} cancelada` : allSaved ? collection.saved : `Descarga ${collection.of} terminada con pendientes`
      : job.cancel_requested || state.albumCancelPending ? 'Cancelando; conservamos las pistas ya guardadas…'
        : job.status === 'queued' ? `Preparando ${collection.object}…` : `Descargando pista ${Number(job.current_track) || Math.min(completed + failed + 1, total)} de ${total} ${collection.of}`);
    text('album-job-percent', `${terminal ? Math.round(progress) : Math.min(99, Math.floor(progress))} %`);
    $('album-progress-bar').value = progress;
    text('album-job-counts', `${completed} de ${total} pistas guardadas${existing ? ` · ${existing} ${existing === 1 ? 'ya estaba' : 'ya estaban'} en tu biblioteca` : ''}${failed ? ` · ${failed} con error` : ''}`);
    const rows = [];
    const labels = { queued: 'Pendiente', downloading: 'Descargando', complete: 'Guardada', existing: 'Ya guardada', error: 'No se pudo guardar', cancelled: 'Cancelada' };
    for (const [index, track] of tracks.entries()) {
      const row = document.createElement('li');
      const knownStatus = Object.hasOwn(labels, track.status) ? track.status : 'queued';
      row.className = `album-job-track is-${knownStatus}`;
      const number = document.createElement('span');
      number.className = 'album-job-track-number';
      number.textContent = String(track.number || index + 1).padStart(2, '0');
      const title = document.createElement('span');
      title.className = 'album-job-track-title';
      title.textContent = track.title || `Canción ${index + 1}`;
      const status = document.createElement('span');
      status.className = 'album-job-track-state';
      const trackProgress = Math.max(0, Math.min(100, Number(track.progress) || 0));
      status.textContent = `${labels[knownStatus]}${knownStatus === 'downloading' ? ` · ${Math.round(trackProgress)} %` : ''}`;
      row.append(number, title, status);
      if (knownStatus === 'downloading') {
        const meter = document.createElement('progress');
        meter.max = 100;
        meter.value = trackProgress;
        meter.setAttribute('aria-label', `Progreso de ${title.textContent}`);
        row.append(meter);
      }
      if (track.error) {
        const reason = document.createElement('p');
        reason.className = 'album-job-track-error';
        reason.textContent = track.error;
        row.append(reason);
      }
      rows.push(row);
    }
    $('album-job-tracks').replaceChildren(...rows);
    show('album-summary', terminal);
    $('album-summary').classList.toggle('has-pending', !allSaved);
    const newlySaved = Math.max(0, completed - existing);
    text('album-summary-text', `${completed} de ${total} pistas guardadas. ${newlySaved} ${newlySaved === 1 ? 'nueva' : 'nuevas'}${existing ? `; ${existing} ${existing === 1 ? 'ya existía' : 'ya existían'}` : ''}.${allSaved ? ` ${collection.ready} en la biblioteca.` : ' Las pistas pendientes se indican abajo.'}`);
    $('album-failures').replaceChildren();
    if (terminal) {
      for (const [index, track] of tracks.entries()) {
        if (['complete', 'existing'].includes(track.status)) continue;
        const item = document.createElement('li');
        item.textContent = `${track.title || `Canción ${index + 1}`} — ${track.error || (job.status === 'cancelled' || track.status === 'cancelled' ? 'Pendiente tras cancelar la descarga.' : 'No se pudo guardar esta pista.')}`;
        $('album-failures').append(item);
      }
    }
    show('album-retry-button', terminal && !allSaved);
    show('album-cancel-button', !terminal);
    $('album-cancel-button').disabled = Boolean(job.cancel_requested || state.albumCancelPending);
    text('album-cancel-button', job.cancel_requested || state.albumCancelPending ? 'Cancelando…' : `Cancelar descarga ${collection.of}`);
    text('album-resume-button', `Recuperar seguimiento ${collection.of} ↗`);
    show('album-resume-button', state.albumInterrupted);
    const newRecordings = tracks.filter((track) => track.recording && !state.recordings.some((item) => item.id === track.recording.id)).map((track) => track.recording);
    if (newRecordings.length) { state.recordings = [...newRecordings, ...state.recordings]; renderLibrary(); }
    updateDownloadControls();
  }
  async function followAlbumJob(id, initialJob = null) {
    if (state.albumPolling) return;
    state.albumPolling = true;
    state.albumInterrupted = false;
    state.downloading = true;
    notice('album-job-error', '');
    show('album-resume-button', false);
    updateDownloadControls();
    let failures = 0;
    let nextJob = initialJob;
    try {
      while (state.albumJobId === id) {
        let job;
        try {
          job = nextJob || await api(`/api/jobs/${encodeURIComponent(id)}`);
          nextJob = null;
          failures = 0;
        } catch (error) {
          if (error.status === 404 || error.status === 410 || ++failures >= 4) throw error;
          text('album-job-status', 'Intentando recuperar el progreso…');
          await new Promise((resolve) => setTimeout(resolve, 2000));
          continue;
        }
        renderAlbumJob(job);
        if (albumTerminalStates.has(job.status)) {
          state.downloading = false;
          state.albumCancelPending = false;
          await refreshLibrary(false);
          const total = Number(job.total) || 0;
          const completed = Number(job.completed) || 0;
          const collection = collectionCopy(job.album);
          toast(`${completed} de ${total} pistas guardadas${completed < total ? `. Revisa las pendientes en ${collection.object}.` : ' en tu biblioteca.'}`);
          break;
        }
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    } catch (error) {
      if (error.status === 404 || error.status === 410) {
        state.downloading = false;
        state.albumJobId = null;
        storeAlbumJob();
        show('album-cancel-button', false);
        notice('album-job-error', `Este seguimiento ya no está disponible. Explora de nuevo ${collectionCopy(state.albumJob?.album).object} para continuar; los archivos guardados se conservan.`);
      } else {
        state.albumInterrupted = true;
        notice('album-job-error', `${errorMessage(error)} La descarga puede seguir en curso. Recupera el seguimiento para ver su estado.`);
        show('album-resume-button');
      }
    } finally {
      state.albumPolling = false;
      updateDownloadControls();
    }
  }
  $('album-download-button').addEventListener('click', () => startAlbumDownload());
  $('album-retry-button').addEventListener('click', () => startAlbumDownload(true));
  $('album-resume-button').addEventListener('click', () => state.albumJobId && followAlbumJob(state.albumJobId));
  $('album-cancel-button').addEventListener('click', async () => {
    if (!state.albumJobId || state.albumCancelPending) return;
    state.albumCancelPending = true;
    $('album-cancel-button').disabled = true;
    text('album-cancel-button', 'Cancelando…');
    try {
      await post(`/api/jobs/${encodeURIComponent(state.albumJobId)}/cancel`, {});
      if (state.albumJob) renderAlbumJob(state.albumJob);
      if (!state.albumPolling) followAlbumJob(state.albumJobId);
    } catch (error) {
      state.albumCancelPending = false;
      notice('album-job-error', errorMessage(error));
      $('album-cancel-button').disabled = false;
      text('album-cancel-button', `Cancelar descarga ${collectionCopy(state.albumJob?.album).of}`);
    }
  });

  function releaseCapture() {
    cancelAnimationFrame(state.raf);
    state.raf = 0;
    const tracks = new Set([...(state.stream?.getTracks() || []), ...(state.audioStream?.getTracks() || [])]);
    for (const track of tracks) {
      track.onended = null;
      try { track.stop(); } catch { /* Already stopped. */ }
    }
    state.stream = null;
    state.audioStream = null;
    if (state.audioContext && state.audioContext.state !== 'closed') state.audioContext.close().catch(() => {});
    state.audioContext = null;
    state.analyser = null;
    for (const bar of bars) bar.style.height = '3px';
  }
  function clearPreview() {
    $('preview-audio').pause();
    $('preview-audio').removeAttribute('src');
    $('preview-audio').load();
    if (state.objectUrl) URL.revokeObjectURL(state.objectUrl);
    state.objectUrl = null;
    state.blob = null;
    state.chunks = [];
    state.chunkBytes = 0;
    state.saved = false;
    state.originalDownloaded = false;
    show('record-preview', false);
    notice('save-status', '');
    state.duration = 0;
    updateClock(0);
  }
  function updateClock(milliseconds) {
    const totalSeconds = Math.floor(milliseconds / 1000);
    const minutes = String(Math.floor(totalSeconds / 60)).padStart(2, '0');
    const seconds = String(totalSeconds % 60).padStart(2, '0');
    const hundredths = String(Math.floor((milliseconds % 1000) / 10)).padStart(2, '0');
    $('recording-clock').replaceChildren(document.createTextNode(`${minutes}:${seconds}`));
    const fraction = document.createElement('span');
    fraction.textContent = `.${hundredths}`;
    $('recording-clock').append(fraction);
  }
  function updateCaptureUi() {
    const phase = state.phase;
    const isActive = activePhases.includes(phase);
    $('recording-deck').classList.toggle('is-recording', phase === 'recording');
    $('record-tab').classList.toggle('capturing', phase === 'recording');
    const label = {
      idle: 'LISTO PARA GRABAR', requesting: 'ELIGIENDO PESTAÑA',
      recording: 'GRABANDO AUDIO', stopping: 'TERMINANDO GRABACIÓN',
      preview: state.saved ? 'GUARDADO EN TU BIBLIOTECA' : 'GRABACIÓN LISTA',
      saving: 'GUARDANDO AUDIO',
    }[phase] || 'LISTO PARA GRABAR';
    $('record-state').replaceChildren(document.createElement('span'), document.createTextNode(label));
    show('start-recording', phase !== 'recording' && phase !== 'stopping');
    show('stop-recording', phase === 'recording' || phase === 'stopping');
    $('stop-recording').disabled = phase === 'stopping';
    $('start-recording').disabled = phase === 'requesting' || phase === 'saving' || hasUnsavedAudio();
    $('start-recording').classList.toggle('busy', phase === 'requesting');
    $('start-recording').textContent = phase === 'requesting' ? 'Elige la pestaña en Chrome…' : state.blob ? 'Grabar otra pestaña' : 'Elegir pestaña y grabar';
    $('save-recording').disabled = !state.blob || phase === 'saving' || !state.connected || state.saved;
    $('save-recording').classList.toggle('busy', phase === 'saving');
    text('save-recording', phase === 'saving' ? 'Guardando audio…' : state.saved ? 'Guardado en biblioteca ✓' : 'Guardar en biblioteca ↓');
    $('discard-recording').disabled = phase === 'saving' || isActive;
    for (const id of ['record-title', 'record-artist', 'record-album', 'record-format', 'record-source']) $(id).disabled = phase === 'saving' || state.saved;
    text('discard-recording', state.saved || state.originalDownloaded ? 'Cerrar grabación' : 'Descartar');
    if (phase === 'idle') text('record-hint', 'La captura comienza después de elegir y compartir una pestaña.');
    else if (phase === 'requesting') text('record-hint', 'Selecciona una pestaña y activa «Compartir audio de pestaña».');
    else if (phase === 'recording') text('record-hint', 'Ya puedes dar play desde el inicio. Mantén abierta la pestaña hasta terminar.');
    else if (phase === 'stopping') text('record-hint', 'Preparando tu grabación para escucharla…');
    else if (phase === 'saving') text('record-hint', 'El audio está en tu equipo. Preparando el archivo para tu biblioteca.');
    else if (phase === 'preview') text('record-hint', hasUnsavedAudio() ? 'Escucha y guarda tu grabación antes de empezar otra.' : 'Audio guardado. Puedes empezar una nueva grabación cuando quieras.');
  }
  function meterFrame() {
    if (state.phase !== 'recording') return;
    const now = performance.now();
    state.duration = now - state.startedAt;
    updateClock(state.duration);
    if (state.analyser) {
      const values = new Uint8Array(state.analyser.frequencyBinCount);
      state.analyser.getByteFrequencyData(values);
      const energy = values.reduce((sum, value) => sum + value, 0) / values.length;
      if (energy > 1.5) state.lastSignalAt = now;
      if (!reducedMotion.matches) bars.forEach((bar, index) => {
        const bucket = Math.floor(index * values.length * 0.65 / bars.length);
        bar.style.height = `${Math.max(3, Math.round(values[bucket] / 255 * 40))}px`;
      });
      else bars.forEach((bar) => { bar.style.height = energy > 1.5 ? '10px' : '3px'; });
      if (now - state.lastSignalAt > 12000) text('record-hint', 'No detectamos audio. Dale play y comprueba que compartiste el audio de la pestaña.');
      else text('record-hint', 'Grabando. Cuando termine la música, pulsa «Detener grabación».');
    }
    state.raf = requestAnimationFrame(meterFrame);
  }
  async function startRecording() {
    if (activePhases.includes(state.phase) || state.phase === 'saving' || hasUnsavedAudio()) return;
    notice('record-error', '');
    if (!navigator.mediaDevices?.getDisplayMedia || !window.MediaRecorder) {
      notice('record-error', 'La captura de pestaña necesita Chrome actualizado y una dirección local (localhost). Abre Surco en Chrome para grabar.');
      return;
    }
    const mimeType = ['audio/webm;codecs=opus', 'audio/webm'].find((type) => MediaRecorder.isTypeSupported(type));
    if (!mimeType) {
      notice('record-error', 'Este navegador no permite grabar audio WebM. Abre Surco en Chrome e inténtalo de nuevo.');
      return;
    }
    const epoch = ++state.captureEpoch;
    state.phase = 'requesting';
    updateCaptureUi();
    let capturedStream = null;
    try {
      capturedStream = await navigator.mediaDevices.getDisplayMedia({
        video: { displaySurface: 'browser' },
        audio: { echoCancellation: false, noiseSuppression: false, suppressLocalAudioPlayback: false },
        selfBrowserSurface: 'exclude', systemAudio: 'exclude', surfaceSwitching: 'exclude',
      });
      if (epoch !== state.captureEpoch) {
        capturedStream.getTracks().forEach((track) => track.stop());
        return;
      }
      state.stream = capturedStream;
      const audioTracks = capturedStream.getAudioTracks().filter((track) => track.readyState === 'live');
      if (!audioTracks.length) throw new Error('No se recibió audio. Vuelve a elegir una pestaña de Chrome y activa «Compartir audio de pestaña».');
      const videoTrack = capturedStream.getVideoTracks()[0];
      const surface = videoTrack?.getSettings?.().displaySurface;
      if (surface && surface !== 'browser') throw new Error('Elige una pestaña de Chrome en lugar de una ventana o una pantalla completa para capturar solamente su audio.');
      state.audioStream = new MediaStream(audioTracks);
      const recorder = new MediaRecorder(state.audioStream, { mimeType, audioBitsPerSecond: 256000 });
      state.recorder = recorder;
      clearPreview();
      state.chunks = [];
      state.pendingRecordError = '';
      state.stopPromise = new Promise((resolve) => { state.stopResolve = resolve; });
      recorder.ondataavailable = (event) => {
        if (!event.data?.size) return;
        state.chunks.push(event.data);
        state.chunkBytes += event.data.size;
        // Leave headroom for the final chunk before the server's 512 MiB limit.
        if (state.chunkBytes >= 500 * 1024 * 1024 && state.phase === 'recording') {
          state.pendingRecordError = 'Detuvimos la grabación para mantenerla dentro del límite de 512 MB. Guarda esta parte y empieza otra para continuar.';
          stopRecording();
        }
      };
      recorder.onstop = finalizeRecording;
      recorder.onerror = () => {
        state.pendingRecordError = 'La captura se interrumpió. Si recuperamos audio, aparecerá abajo para que puedas guardarlo.';
        stopRecording();
      };
      for (const track of capturedStream.getTracks()) track.onended = () => {
        if (state.phase === 'recording') stopRecording();
      };
      try {
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        if (AudioContext) {
          state.audioContext = new AudioContext();
          await state.audioContext.resume();
          state.analyser = state.audioContext.createAnalyser();
          state.analyser.fftSize = 256;
          state.analyser.smoothingTimeConstant = 0.78;
          state.audioContext.createMediaStreamSource(state.audioStream).connect(state.analyser);
        }
      } catch {
        if (state.audioContext && state.audioContext.state !== 'closed') state.audioContext.close().catch(() => {});
        state.audioContext = null;
        state.analyser = null;
      }
      if (epoch !== state.captureEpoch) {
        capturedStream.getTracks().forEach((track) => track.stop());
        return;
      }
      if (!audioTracks.some((track) => track.readyState === 'live')) throw new Error('La pestaña dejó de compartir audio antes de empezar. Vuelve a seleccionarla.');
      recorder.start(1000);
      state.startedAt = performance.now();
      state.lastSignalAt = state.startedAt;
      state.phase = 'recording';
      updateCaptureUi();
      meterFrame();
    } catch (error) {
      capturedStream?.getTracks().forEach((track) => track.stop());
      if (epoch !== state.captureEpoch) return;
      releaseCapture();
      state.recorder = null;
      state.stopResolve?.();
      state.stopResolve = null;
      state.stopPromise = null;
      state.phase = state.blob ? 'preview' : 'idle';
      let message = errorMessage(error);
      if (error.name === 'NotAllowedError' || error.name === 'AbortError') message = 'No se inició la grabación. Puedes volver a elegir una pestaña cuando quieras.';
      if (error.name === 'NotReadableError') message = 'Chrome no pudo capturar esta pestaña. Comprueba los permisos de grabación de pantalla del sistema e inténtalo de nuevo.';
      notice('record-error', message);
      updateCaptureUi();
    }
  }
  function stopRecording() {
    if (state.phase === 'requesting') {
      ++state.captureEpoch;
      releaseCapture();
      state.recorder = null;
      state.stopResolve?.();
      state.stopResolve = null;
      state.stopPromise = null;
      state.phase = state.blob ? 'preview' : 'idle';
      updateCaptureUi();
      return Promise.resolve();
    }
    if (state.phase === 'stopping') return state.stopPromise || Promise.resolve();
    if (state.phase !== 'recording') { releaseCapture(); return Promise.resolve(); }
    state.duration = performance.now() - state.startedAt;
    state.phase = 'stopping';
    updateClock(state.duration);
    updateCaptureUi();
    const completion = state.stopPromise || Promise.resolve();
    try {
      if (state.recorder && state.recorder.state !== 'inactive') state.recorder.stop();
      else if (!state.recorder) finalizeRecording();
    } catch (error) {
      state.pendingRecordError = `La grabación se interrumpió: ${errorMessage(error)}`;
      finalizeRecording();
    }
    releaseCapture();
    return completion;
  }
  function finalizeRecording() {
    releaseCapture();
    const blob = new Blob(state.chunks, { type: 'audio/webm' });
    state.chunks = [];
    state.recorder = null;
    if (blob.size > 0) {
      state.blob = blob;
      state.objectUrl = URL.createObjectURL(blob);
      $('preview-audio').src = state.objectUrl;
      text('recording-size', `${formatDuration(state.duration / 1000)} · ${formatBytes(blob.size)}`);
      show('record-preview');
      state.phase = 'preview';
      if (!$('record-title').value.trim()) $('record-title').value = `Grabación del ${new Intl.DateTimeFormat('es', { day: 'numeric', month: 'long' }).format(new Date())}`;
    } else {
      state.phase = 'idle';
      state.pendingRecordError ||= 'La grabación no produjo audio. Vuelve a compartir una pestaña con la opción de audio activada.';
    }
    if (state.pendingRecordError) notice('record-error', state.pendingRecordError);
    state.stopResolve?.();
    state.stopResolve = null;
    state.stopPromise = null;
    updateCaptureUi();
  }
  $('start-recording').addEventListener('click', startRecording);
  $('stop-recording').addEventListener('click', stopRecording);
  $('discard-recording').addEventListener('click', () => {
    if (state.phase === 'saving' || activePhases.includes(state.phase)) return;
    if (hasUnsavedAudio() && !window.confirm('Esta grabación todavía no está guardada. ¿Quieres descartarla?')) return;
    releaseCapture();
    clearPreview();
    state.phase = 'idle';
    notice('record-error', '');
    updateCaptureUi();
  });
  $('save-original').addEventListener('click', () => {
    if (!state.blob || !state.objectUrl) return;
    const name = ($('record-title').value.trim() || 'Grabación Surco').replace(/[<>:"/\\|?*\u0000-\u001f]/g, '-').slice(0, 150);
    const anchor = document.createElement('a');
    anchor.href = state.objectUrl;
    anchor.download = `${name}.webm`;
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    state.originalDownloaded = true;
    updateCaptureUi();
    toast('Descarga del WebM original iniciada. También puedes guardarlo en tu biblioteca.');
  });
  $('save-recording-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!state.blob || state.phase === 'saving' || state.saved) return;
    state.phase = 'saving';
    updateCaptureUi();
    notice('save-status', 'Preparando el archivo. Puedes rescatar el WebM original en cualquier momento.');
    $('save-status').classList.remove('notice-error');
    const params = new URLSearchParams({
      title: $('record-title').value.trim() || 'Grabación Surco',
      artist: $('record-artist').value.trim(), album: $('record-album').value.trim(),
      format: $('record-format').value, source_url: $('record-source').value.trim(),
    });
    try {
      const { recording } = await api(`/api/recordings?${params}`, {
        method: 'POST', headers: { 'Content-Type': 'audio/webm' }, body: state.blob,
      });
      state.saved = true;
      if (recording) addRecording(recording);
      notice('save-status', 'Guardado en tu biblioteca. Tu archivo ya está en la carpeta local de Surco.');
      toast('Grabación guardada en tu biblioteca.');
      await refreshLibrary(false);
    } catch (error) {
      $('save-status').classList.add('notice-error');
      notice('save-status', `${errorMessage(error)} Tu audio sigue aquí: puedes reintentar o descargar el WebM original.`);
    } finally {
      state.phase = 'preview';
      updateCaptureUi();
    }
  });

  function addRecording(recording) {
    state.recordings = [recording, ...state.recordings.filter((item) => item.id !== recording.id)];
    renderLibrary();
  }
  function iconButton(label, path) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'icon-button';
    button.setAttribute('aria-label', label);
    button.title = label;
    button.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true">${path}</svg>`;
    return button;
  }
  function renderLibrary() {
    const recordings = state.recordings;
    const query = $('library-search').value.trim().toLocaleLowerCase('es');
    const filtered = recordings.filter((item) => `${item.title || ''} ${item.artist || ''} ${item.album || ''}`.toLocaleLowerCase('es').includes(query));
    text('nav-count', String(recordings.length));
    text('library-count', String(recordings.length));
    show('library-empty', recordings.length === 0);
    show('library-no-results', recordings.length > 0 && filtered.length === 0);
    if (state.currentPlayer) { state.currentPlayer.pause(); state.currentPlayer = null; }
    $('library-list').replaceChildren();
    for (const recording of filtered) {
      const row = document.createElement('article');
      row.className = 'library-item';
      const art = document.createElement('div');
      art.className = 'library-item-art';
      art.setAttribute('aria-hidden', 'true');
      art.innerHTML = '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="3"/><path d="M6 12a6 6 0 0 1 6-6"/></svg>';
      const info = document.createElement('div');
      const title = document.createElement('h3');
      title.className = 'library-item-title';
      title.textContent = recording.title || recording.filename || 'Sin título';
      const meta = document.createElement('p');
      meta.className = 'library-item-meta';
      const source = { recording: 'Grabación de pestaña', official: 'Descarga oficial', stream: 'Audio de escucha', available: 'Archivo disponible' }[recording.source] || 'Audio';
      meta.textContent = [recording.artist, recording.album, source, friendlyDate(recording.created_at), formatBytes(recording.bytes)].filter(Boolean).join(' · ');
      info.append(title, meta);
      const actions = document.createElement('div');
      actions.className = 'library-item-actions';
      const format = document.createElement('span');
      format.className = 'format-tag';
      format.textContent = (recording.format || '').toUpperCase();
      const listen = iconButton(`Escuchar ${title.textContent}`, '<path d="m9 5 11 7-11 7Z"/>');
      listen.setAttribute('aria-expanded', 'false');
      const player = document.createElement('div');
      player.className = 'library-player';
      player.hidden = true;
      const audio = document.createElement('audio');
      audio.controls = true;
      audio.preload = 'none';
      audio.src = fileUrl(recording);
      audio.setAttribute('aria-label', `Escuchar ${title.textContent}`);
      audio.addEventListener('play', () => {
        if (state.currentPlayer && state.currentPlayer !== audio) state.currentPlayer.pause();
        $('preview-audio').pause();
        state.currentPlayer = audio;
      });
      audio.addEventListener('error', () => toast('El navegador no pudo reproducir este formato. Puedes descargar el archivo y abrirlo con tu reproductor.'));
      player.append(audio);
      listen.addEventListener('click', () => {
        player.hidden = !player.hidden;
        listen.setAttribute('aria-expanded', String(!player.hidden));
        if (player.hidden) audio.pause();
        else audio.play().catch(() => {});
      });
      const download = document.createElement('a');
      download.className = 'icon-button';
      download.href = fileUrl(recording, true);
      download.download = recording.filename || '';
      download.setAttribute('aria-label', `Descargar ${title.textContent}`);
      download.title = 'Descargar archivo';
      download.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v12m-5-5 5 5 5-5M4 17v4h16v-4"/></svg>';
      const reveal = iconButton(`Mostrar ${title.textContent} en su carpeta`, '<path d="M3 7a2 2 0 0 1 2-2h5l2 2h7a2 2 0 0 1 2 2v10H3Z"/>');
      reveal.addEventListener('click', () => revealFolder(recording.id));
      actions.append(format, listen, download, reveal);
      row.append(art, info, actions, player);
      $('library-list').append(row);
    }
  }
  async function refreshLibrary(notify = true) {
    $('refresh-library').disabled = true;
    notice('library-error', '');
    try {
      const { recordings } = await api('/api/library');
      state.recordings = Array.isArray(recordings) ? recordings : [];
      renderLibrary();
      if (notify) toast('Biblioteca actualizada.');
    } catch (error) { notice('library-error', errorMessage(error)); }
    finally { $('refresh-library').disabled = false; }
  }
  async function revealFolder(id) {
    try { await post('/api/reveal', id ? { id } : {}); }
    catch (error) { toast(errorMessage(error)); }
  }
  $('library-search').addEventListener('input', renderLibrary);
  $('refresh-library').addEventListener('click', () => refreshLibrary());
  $('open-folder').addEventListener('click', () => revealFolder());
  $('retry-connection').addEventListener('click', connect);
  $('preview-audio').addEventListener('play', () => state.currentPlayer?.pause());
  document.querySelectorAll('.nav-link').forEach((link) => link.addEventListener('click', () => {
    document.querySelectorAll('.nav-link').forEach((other) => other.classList.toggle('active', other === link));
  }));
  window.addEventListener('beforeunload', (event) => {
    if (activePhases.includes(state.phase) || state.phase === 'saving' || hasUnsavedAudio()) {
      event.preventDefault();
      event.returnValue = '';
    }
  });
  window.addEventListener('pagehide', () => {
    ++state.captureEpoch;
    try { if (state.recorder?.state === 'recording') state.recorder.stop(); } catch { /* Page is closing. */ }
    releaseCapture();
    if (state.objectUrl) URL.revokeObjectURL(state.objectUrl);
  });
  updateCaptureUi();
  connect();
})();
