const byId = id => document.getElementById(id);
const panelView = location.pathname === '/panel';

function status(id, message = '', error = false) {
  const element = byId(id);
  element.textContent = message;
  element.classList.toggle('error', error);
  element.hidden = !message;
}

async function request(url, options) {
  let response;
  try {
    response = await fetch(url, options);
  } catch {
    throw new Error('No se pudo conectar con VITRINA. Comprueba que el servidor local esté abierto.');
  }
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || 'No se pudo completar la operación.');
  return result;
}

function sendJson(method, body) {
  return { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) };
}

function trackLabel(track) {
  const label = document.createElement('span');
  const title = document.createElement('span');
  title.className = 'track-title';
  title.textContent = track.title;
  label.append(title);
  if (track.credits) {
    const credits = document.createElement('span');
    credits.className = 'track-credits';
    credits.textContent = track.credits;
    label.append(credits);
  }
  return label;
}

function songCount(count) {
  return count + (count === 1 ? ' canción' : ' canciones');
}

function initArtist({ profile, tracks }) {
  byId('artist-name').textContent = profile.name;
  byId('artist-genre').textContent = profile.genre || 'Perfil de artista';
  byId('artist-about').hidden = !profile.bio;
  byId('artist-bio').textContent = profile.bio;
  document.title = profile.name + ' · VITRINA';
  byId('track-count').textContent = songCount(tracks.length);
  status('artist-message');
  if (!tracks.length) {
    const empty = byId('artist-message');
    empty.textContent = 'Todavía no hay canciones visibles. ';
    const link = document.createElement('a');
    link.href = '/panel';
    link.textContent = 'Ir al panel del artista';
    empty.append(link);
    empty.hidden = false;
    return;
  }

  const list = byId('artist-tracks');
  const audio = byId('audio');
  const buttons = new Map();
  let selected = null;

  function updatePlayer() {
    buttons.forEach((button, trackId) => {
      const current = selected?.id === trackId;
      const playing = current && !audio.paused && !audio.ended;
      button.setAttribute('aria-current', String(current));
      button.setAttribute('aria-label', (playing ? 'Pausar ' : 'Escuchar ') + button.dataset.title);
      button.firstElementChild.textContent = playing ? 'Ⅱ' : '▷';
    });
  }

  function select(track) {
    selected = track;
    byId('player-title').textContent = track.title;
    audio.setAttribute('aria-label', 'Reproductor de ' + track.title);
    status('player-message');
    audio.src = '/audio/' + track.id;
    updatePlayer();
  }

  tracks.forEach((track, index) => {
    const row = document.createElement('li');
    const button = document.createElement('button');
    const icon = document.createElement('span');
    const number = document.createElement('span');
    button.type = 'button';
    button.className = 'song-button';
    button.dataset.title = track.title;
    icon.className = 'play-icon';
    icon.setAttribute('aria-hidden', 'true');
    number.className = 'track-number';
    number.setAttribute('aria-hidden', 'true');
    number.textContent = String(index + 1).padStart(2, '0');
    button.append(icon, trackLabel(track), number);
    button.addEventListener('click', async () => {
      if (selected?.id === track.id && !audio.paused && !audio.ended) {
        audio.pause();
        return;
      }
      if (selected?.id !== track.id) select(track);
      status('player-message');
      try {
        await audio.play();
      } catch (error) {
        if (selected?.id === track.id && error.name !== 'AbortError') {
          status('player-message', 'El navegador no pudo reproducir este MP3.', true);
        }
      }
    });
    buttons.set(track.id, button);
    row.append(button);
    list.append(row);
  });

  ['play', 'pause', 'ended', 'error'].forEach(event => audio.addEventListener(event, updatePlayer));
  audio.addEventListener('error', () => status('player-message', 'El navegador no pudo cargar este MP3.', true));
  byId('player').hidden = false;
  select(tracks[0]);
}

function initPanel({ profile, tracks }) {
  const upload = byId('upload-form');
  const uploadButton = upload.querySelector('button');
  const title = upload.elements.namedItem('title');
  const fileInput = upload.elements.namedItem('audio');
  const profileForm = byId('profile-form');
  const catalogue = byId('panel-tracks');

  function updateCount() {
    const count = catalogue.children.length;
    byId('panel-count').textContent = songCount(count);
    byId('catalogue-empty').hidden = count > 0;
  }

  function addTrackRow(track) {
    const row = document.createElement('li');
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'button secondary visibility';
    button.setAttribute('aria-label', 'Visible en la vitrina: ' + track.title);
    function showVisibility() {
      button.setAttribute('aria-pressed', String(track.visible));
      button.textContent = track.visible ? 'Visible' : 'Oculta';
    }
    showVisibility();
    button.addEventListener('click', async () => {
      button.disabled = true;
      status('catalogue-message');
      try {
        const updated = await request('/api/tracks/' + track.id, sendJson('PATCH', { visible: !track.visible }));
        track.visible = updated.visible;
        showVisibility();
        status('catalogue-message', track.title + (track.visible ? ' se muestra en la vitrina.' : ' quedó oculta.'));
      } catch (error) {
        status('catalogue-message', error.message, true);
      } finally {
        button.disabled = false;
      }
    });
    row.append(trackLabel(track), button);
    catalogue.append(row);
  }

  tracks.forEach(addTrackRow);
  updateCount();
  status('panel-message');

  fileInput.addEventListener('change', () => {
    const file = fileInput.files[0];
    if (file && !title.value.trim()) title.value = file.name.replace(/\.mp3$/i, '').slice(0, title.maxLength);
  });

  upload.addEventListener('submit', async event => {
    event.preventDefault();
    const file = fileInput.files[0];
    if (!file || !/\.mp3$/i.test(file.name)) {
      status('upload-message', 'Selecciona un archivo con extensión .mp3.', true);
      return;
    }
    if (file.size > 80 * 1024 * 1024) {
      status('upload-message', 'El límite es de 80 MB por canción.', true);
      return;
    }
    const fields = new URLSearchParams({ title: title.value, credits: upload.elements.namedItem('credits').value });
    [...upload.elements].forEach(element => { element.disabled = true; });
    uploadButton.textContent = 'Subiendo…';
    status('upload-message', 'Guardando el archivo en este Mac…');
    try {
      const track = await request('/api/tracks?' + fields, {
        method: 'POST', headers: { 'Content-Type': 'audio/mpeg' }, body: file,
      });
      upload.reset();
      addTrackRow(track);
      updateCount();
      status('upload-message', track.title + ' ya aparece en la vista del artista.');
    } catch (error) {
      status('upload-message', error.message, true);
    } finally {
      [...upload.elements].forEach(element => { element.disabled = false; });
      uploadButton.textContent = 'Subir MP3';
    }
  });

  for (const key of ['name', 'genre', 'bio']) profileForm.elements.namedItem(key).value = profile[key];
  profileForm.addEventListener('submit', async event => {
    event.preventDefault();
    const fields = Object.fromEntries(new FormData(profileForm));
    const button = profileForm.querySelector('button');
    button.disabled = true;
    try {
      await request('/api/profile', sendJson('PUT', fields));
      status('profile-message', 'Perfil guardado.');
    } catch (error) {
      status('profile-message', error.message, true);
    } finally {
      button.disabled = false;
    }
  });
}

const view = panelView ? 'panel' : 'artist';
byId(view).hidden = false;
byId(view + '-link').setAttribute('aria-current', 'page');
if (panelView) document.title = 'Panel del artista · VITRINA';

try {
  const data = await request('/api/' + view);
  if (panelView) initPanel(data);
  else initArtist(data);
} catch (error) {
  status(view + '-message', error.message, true);
}
