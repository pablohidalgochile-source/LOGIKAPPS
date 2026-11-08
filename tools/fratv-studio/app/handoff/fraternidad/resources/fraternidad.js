/* Catálogo Fraternidad: un mismo cuadro para editor, exportación y fuente de OBS.
   Los relojes de muestra son estáticos. El servicio vivo escribe su valor compartido. */
(() => {
  'use strict';
  const meta = JSON.parse(document.getElementById('resource-config').textContent);
  const query = new URLSearchParams(location.search);
  const piece = meta.id.replace('fraternidad-', '');
  const aspect = query.get('aspecto') === '9:16' ? '9:16' : '16:9';
  const font = ['editorial', 'neutro'].includes(query.get('tipo')) ? query.get('tipo') : 'aprobado';
  const root = document.documentElement;
  root.dataset.aspecto = aspect;
  root.dataset.piece = piece;
  root.dataset.font = font;
  const art = document.getElementById('art');
  const signature = '<div class="signature"><img src="../../assets/eventos/fraternidad-horizontal-blanco.png" alt="Fraternidad · Campus Central"></div>';
  const emblem = (className = '', bounds = true) => `<div class="emblem ${className}"${bounds ? ' data-check-bounds' : ''}><img src="../../assets/eventos/fraternidad-insignia.png" alt="Insignia Frate · Fraternidad Campus Central"></div>`;
  const clock = (className = 'clock-digits') => `<span class="${className}" data-field="clock" data-clock data-clock-format="short">${piece === 'live' ? '00:00' : '05:00'}</span>`;
  const field = (tag, key, className = '') => `<${tag} class="${className}" data-field="${key}"></${tag}>`;
  function intro(withClock, kicker, footer) {
    return `<div class="intro-stage"><div class="intro-content" data-check-bounds><div class="intro-copy"><p class="intro-kicker">${kicker}</p>${field('h1','title','intro-title')}${field('p','subtitle','intro-subtitle')}${withClock ? `<div class="clock-block"><span class="clock-caption">${piece === 'break' ? 'REGRESAMOS EN' : 'COMENZAMOS EN'}</span>${clock()}</div>` : piece === 'out' ? '<div class="social-lines" data-list="socials"></div>' : ''}</div>${emblem('intro-emblem')}</div><footer class="intro-footer" data-check-bounds><span>${footer}</span><span>FRATERNIDAD · CAMPUS CENTRAL</span></footer></div>`;
  }
  const designs = {
    flag: `<div class="channel-bug" data-check-bounds>${signature}</div>`,
    'lower-third': `<div class="lower" data-check-bounds><div class="lower-brand">${signature}</div><div class="lower-copy">${field('h1','name','person-name')}${field('p','role','person-role')}</div></div>`,
    start: intro(true,'NOS ENCONTRAMOS EN VIVO','La transmisión comenzará en unos minutos'),
    break: intro(true,'HACEMOS UNA PAUSA','Gracias por seguir acompañándonos'),
    out: intro(false,'GRACIAS POR SER PARTE','Nos encontramos en el próximo programa'),
    technical: intro(false,'CONTINUIDAD DE TRANSMISIÓN','Gracias por tu paciencia'),
    'ident-long': `<div class="intro-stage"><div class="center-identity" data-check-bounds>${emblem()}${field('h1','title')}${field('p','subtitle')}</div></div>`,
    'ident-short': `<div class="intro-stage identity-short"><div class="center-identity" data-check-bounds>${emblem()}${field('h1','title')}${field('p','subtitle')}</div></div>`,
    'program-title': `<div class="corner-signature" data-check-bounds>${signature}</div><div class="panel program-panel" data-check-bounds>${field('p','kicker','panel-label')}${field('h1','title')}${field('p','subtitle')}</div>`,
    countdown: `<div class="standalone-clock" data-check-bounds>${field('span','caption','clock-caption')}${clock()}</div>`,
    live: `<div class="live-panel" data-check-bounds>${field('span','label','live-label')}${clock()}</div>`,
    schedule: `<div class="agenda" data-check-bounds><div class="agenda-heading">${field('h1','label')}${field('span','dayLabel')}</div><div data-rows="agenda"></div></div>`,
    ticker: `<div class="news-band" data-check-bounds>${field('div','label','news-label')}<div class="news-window"><div class="news-track" data-list="items"></div></div></div>`,
    sponsor: `<div class="panel sponsor-panel" data-check-bounds>${field('p','label','panel-label')}<img id="sponsor-logo" alt="Logo del auspiciador" hidden>${field('h1','name')}</div>`,
    comment: `<div class="panel comment-panel" data-check-bounds>${field('h1','name')}${field('p','comment')}</div>`,
    credits: `<div class="intro-stage"><div class="credits-shell"><div class="credits-brand" data-check-bounds>${emblem('',false)}<h1>CRÉDITOS</h1></div><div class="credits-window"><div class="credits-track" data-rows="credits"></div></div></div></div>`,
    stinger: `<div class="transition-panel">${emblem('',false)}</div>`,
  };
  art.innerHTML = designs[piece];
  const values = {};
  for (const spec of meta.fields) {
    const raw = query.get(spec.key);
    values[spec.key] = raw === null ? spec.default ?? '' :
      spec.type === 'rows' ? raw.split(';').filter(Boolean).map(row => row.split('|')) :
      spec.type === 'textlist' ? raw.split(';').filter(Boolean) : raw.replace(/\\n/g, '\n');
  }
  for (const [key, value] of Object.entries(values)) {
    for (const node of document.querySelectorAll(`[data-field="${key}"]`)) node.textContent = String(value);
  }
  for (const node of document.querySelectorAll('[data-list]')) {
    for (const item of values[node.dataset.list] || []) {
      const span = document.createElement('span');
      span.textContent = String(item);
      node.append(span);
    }
  }
  const rowHolder = document.querySelector('[data-rows]');
  if (rowHolder) {
    const credits = rowHolder.dataset.rows === 'credits';
    for (const row of values.rows || []) {
      const line = document.createElement('div');
      line.className = credits ? 'credits-row' : 'agenda-row';
      if (credits) {
        const role = document.createElement('p'), name = document.createElement('p');
        role.className = 'credits-role'; name.className = 'credits-name';
        role.textContent = row[0] || ''; name.textContent = row[1] || '';
        line.append(role, name);
      } else {
        const time = document.createElement('span'), content = document.createElement('div'), title = document.createElement('p'), tag = document.createElement('span');
        time.className = 'agenda-time'; title.className = 'agenda-title'; tag.className = 'agenda-tag';
        time.textContent = row[0] || ''; title.textContent = row[1] || ''; tag.textContent = row[2] || '';
        content.append(title); if (tag.textContent) content.append(tag);
        line.append(time, content);
      }
      rowHolder.append(line);
    }
  }
  const sponsorLogo = document.getElementById('sponsor-logo');
  if (sponsorLogo && values.logo) {
    const value = String(values.logo);
    if (/^(?:https?:\/\/|(?:\.\.\/)+assets\/|\/media\/assets\/)/i.test(value)) {
      sponsorLogo.src = value.startsWith('../assets/') ? '../' + value : value;
      sponsorLogo.hidden = false;
    }
  }
  const fontUrls = {
    aprobado: 'https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700;800&family=IBM+Plex+Mono:wght@400;500&display=swap',
    editorial: 'https://fonts.googleapis.com/css2?family=Instrument+Sans:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500&display=swap',
    neutro: 'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=IBM+Plex+Mono:wght@400;500&display=swap',
  };
  const fontLink = document.createElement('link');
  fontLink.rel = 'stylesheet'; fontLink.href = fontUrls[font];
  const fontsReady = new Promise((resolve, reject) => {
    fontLink.onload = resolve;
    fontLink.onerror = () => reject(new Error('No se pudo cargar la tipografía.'));
  });
  document.head.append(fontLink);
  let animations = [], frame = null, currentTime = 0, playing = false, ready = false;
  // La unidad de diseño viene de la hoja común de formatos, sin duplicar divisores.
  const scaleProbe = document.createElement('span');
  scaleProbe.hidden = true;
  scaleProbe.style.fontSize = 'var(--fr-u)';
  document.body.append(scaleProbe);
  const unit = () => parseFloat(getComputedStyle(scaleProbe).fontSize);
  function fitName() {
    const name = document.querySelector('.person-name');
    if (!name) return;
    name.style.whiteSpace = 'nowrap';
    let size = aspect === '9:16' ? 58 : 52;
    name.style.fontSize = `${size * unit()}px`;
    while (name.scrollWidth > name.clientWidth + 1 && size > 30) name.style.fontSize = `${--size * unit()}px`;
    if (name.scrollWidth > name.clientWidth + 1) name.style.whiteSpace = 'normal';
  }
  function fitContent() {
    fitName();
    for (const node of document.querySelectorAll('.intro-title,.center-identity h1,.program-panel h1,.agenda-title,.comment-panel p,.sponsor-panel h1')) {
      node.style.fontSize = '';
      let size = parseFloat(getComputedStyle(node).fontSize);
      const original = size;
      while (node.scrollWidth > node.clientWidth + 1 && size > original * .55) node.style.fontSize = `${--size}px`;
    }
    const intro = document.querySelector('.intro-content');
    if (intro) {
      const title = intro.querySelector('.intro-title'), copy = intro.querySelector('.intro-copy');
      const badge = intro.querySelector('.intro-emblem');
      const available = intro.clientHeight - (aspect === '9:16' ? badge.getBoundingClientRect().height + parseFloat(getComputedStyle(intro).gap) : 0);
      let size = parseFloat(getComputedStyle(title).fontSize), attempts = 0;
      while (copy.scrollHeight > available - 2 && size > 28 * unit() && attempts++ < 100) title.style.fontSize = `${size -= unit()}px`;
    }
    const agenda = document.querySelector('.agenda');
    if (agenda) {
      const nodes = [...agenda.querySelectorAll('.agenda-title,.agenda-time,.agenda-tag')];
      nodes.forEach(node => { node.style.fontSize = ''; });
      let attempts = 0;
      while (agenda.scrollHeight > agenda.clientHeight + 1 && attempts++ < 40) {
        nodes.forEach(node => { const size = parseFloat(getComputedStyle(node).fontSize); node.style.fontSize = `${Math.max(14 * unit(), size - unit())}px`; });
      }
    }
  }
  function applyTime(value) {
    currentTime = Math.max(0, Math.min(meta.durationMs, Number(value) || 0));
    animations.forEach(animation => { animation.pause(); animation.currentTime = Math.min(currentTime, 1600); });
    if (['lower-third','program-title','schedule','sponsor','comment'].includes(piece)) {
      // La salida termina antes del último cuadro exportado a 60 fps.
      const exit = Math.max(0, Math.min(1, (currentTime - (meta.durationMs - 600)) / 400));
      art.style.opacity = String(1 - exit);
    }
    if (piece === 'stinger') {
      const x = currentTime < 250 ? -101 * (1 - currentTime / 250) : currentTime <= 550 ? 0 : 101 * Math.min(1, (currentTime - 550) / 200);
      document.querySelector('.transition-panel').style.transform = `translateX(${x}%)`;
    }
    if (piece === 'ticker') {
      const track = document.querySelector('.news-track'), viewport = document.querySelector('.news-window');
      const phase = currentTime / meta.durationMs;
      track.style.transform = `translateX(${viewport.clientWidth - phase * (viewport.clientWidth + track.scrollWidth)}px)`;
    }
    if (piece === 'credits') {
      const track = document.querySelector('.credits-track'), viewport = document.querySelector('.credits-window');
      const phase = currentTime / meta.durationMs;
      track.style.transform = `translateY(${viewport.clientHeight - phase * (viewport.clientHeight + track.scrollHeight)}px)`;
    }
  }
  function pause() { playing = false; if (frame !== null) cancelAnimationFrame(frame); frame = null; }
  function seek(time) { pause(); applyTime(time); }
  function play() {
    if (!ready) return;
    pause(); playing = true;
    const startTime = performance.now(), initial = currentTime >= meta.durationMs ? 0 : currentTime;
    function tick(now) {
      if (!playing) return;
      const elapsed = initial + now - startTime;
      applyTime(meta.loop ? elapsed % meta.durationMs : Math.min(elapsed, meta.durationMs));
      if (!meta.loop && elapsed >= meta.durationMs) { pause(); return; }
      frame = requestAnimationFrame(tick);
    }
    frame = requestAnimationFrame(tick);
  }
  const api = {
    meta, aspecto: aspect, realtime: false, seek, play, pause,
    ready: (async () => {
      await fontsReady;
      void document.body.offsetWidth;
      await document.fonts.ready;
      await Promise.all([...document.images].filter(img => img.getAttribute('src')).map(img => img.decode()));
      await new Promise(resolve => requestAnimationFrame(resolve));
      fitContent();
      animations = document.getAnimations();
      ready = true;
      seek(0);
      if (query.get('autoplay') !== '0') play();
      return true;
    })(),
  };
  window.FRATV = api;
  addEventListener('resize', () => { if (ready) { fitContent(); applyTime(currentTime); } });
})();
