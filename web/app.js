(() => {
  'use strict';

  const STORAGE_KEY = 'logikapps.state.v1';
  const BACKUP_KEY = 'logikapps.state.before-import.v1';
  const { MAX_BYTES, validURL, parseImport, serialize } = window.LogikappsState;
  const validatedState = (input) => window.LogikappsState.validatedState(input, native);
  const native = Boolean(window.webkit?.messageHandlers?.logikapps);
  const pending = new Map();
  const discoverAdding = new Set();
  const publicGuide = 'https://github.com/pablohidalgochile-source/LOGIKAPPS#readme';
  const categories = { music: 'Música y video', business: 'Negocios', personal: 'Personal', creative: 'Creatividad' };
  const ideaStatuses = { idea: 'Idea', development: 'En desarrollo', ready: 'Lista para lanzar' };
  const paths = {
    home: '<path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-8H9v8H4a1 1 0 0 1-1-1Z"/>',
    grid: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
    bulb: '<path d="M9 18h6M10 21h4M8 14a7 7 0 1 1 8 0c-1.4 1-1.2 2-1.2 2H9.2S9.4 15 8 14Z"/>',
    star: '<path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-3-5.6 3 1.1-6.2L3 9.6l6.2-.9Z"/>',
    folder: '<path d="M3 7a2 2 0 0 1 2-2h5l2 2h7a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z"/>',
    settings: '<path d="m9.5 3-.7 2.2-2 .9-2.2-.5-2.1 3.6 1.5 1.7v2.2l-1.5 1.7 2.1 3.6 2.2-.5 2 .9.7 2.2h5l.7-2.2 2-.9 2.2.5 2.1-3.6-1.5-1.7v-2.2l1.5-1.7-2.1-3.6-2.2.5-2-.9L14.5 3Z"/><circle cx="12" cy="12" r="3"/>',
    search: '<circle cx="10.7" cy="10.7" r="7.2"/><path d="m16 16 5 5"/>',
    plus: '<path d="M12 4v16M4 12h16"/>',
    close: '<path d="m6 6 12 12M18 6 6 18"/>',
    edit: '<path d="m15 5 4 4M4 20l5-1 12-12a2.8 2.8 0 0 0-4-4L5 15Z"/>',
    play: '<path d="m8 4 12 8-12 8Z" fill="currentColor" stroke-linejoin="round"/>',
    waves: '<path d="M3 10v4M6 7v10M9 4v16M12 8v8M15 2v20M18 6v12M21 10v4"/>',
    disc: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="2.5"/><path d="M6 12a6 6 0 0 1 6-6m6 6a6 6 0 0 1-6 6"/>',
    diamond: '<path d="m3 8 4-5h10l4 5-9 13ZM3 8h18M7 3l5 18 5-18M7 3l5 5 5-5"/>',
    frate: '<path d="M5 20V4h14M5 12h11" stroke-width="4" stroke-linecap="round"/>',
    snow: '<path d="M12 2v20M3.3 7l17.4 10M3.3 17 20.7 7M8 4l4 3 4-3M8 20l4-3 4 3M3 11l5-1-1-5M21 13l-5 1 1 5M3 13l5 1-1 5M21 11l-5-1 1-5"/>',
    link: '<path d="m10 14 4-4M8 16l-1 1a4.2 4.2 0 0 1-6-6l5-5a4.2 4.2 0 0 1 6 0M16 8l1-1a4.2 4.2 0 0 1 6 6l-5 5a4.2 4.2 0 0 1-6 0" transform="translate(0 0) scale(.92)"/>',
    globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a18 18 0 0 1 0 18 18 18 0 0 1 0-18Z"/>',
    music: '<path d="M9 18V5l12-2v13M9 8l12-2"/><ellipse cx="6" cy="18" rx="3" ry="3"/><ellipse cx="18" cy="16" rx="3" ry="3"/>',
    film: '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M7 3v18M17 3v18M3 8h4M3 16h4M17 8h4M17 16h4M7 12h10"/>',
    sparkles: '<path d="m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5ZM20 2v4M18 4h4"/>',
    briefcase: '<rect x="3" y="7" width="18" height="14" rx="2"/><path d="M8 7V3h8v4M3 12a21 21 0 0 0 18 0M10 12h4v4h-4Z"/>',
    heart: '<path d="M12 21 3.5 12.5a5.7 5.7 0 0 1 8.5-7.4 5.7 5.7 0 0 1 8.5 7.4Z"/>',
    house: '<path d="m3 10 9-7 9 7v10H3Z"/><path d="M9 20v-7h6v7"/>',
    terminal: '<rect x="2" y="4" width="20" height="16" rx="2"/><path d="m6 8 4 4-4 4M13 16h5"/>',
    download: '<path d="M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5"/>',
    upload: '<path d="M12 16V4m-5 5 5-5 5 5M4 16v5h16v-5"/>',
    shield: '<path d="m12 3 8 3v6c0 4-5 7.5-8 9-3-1.5-8-5-8-9V6Z"/><path d="m8 12 3 3 5-6"/>',
    arrow: '<path d="M5 12h14m-6-6 6 6-6 6"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    external: '<path d="M14 3h7v7m0-7L10 14M10 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-5"/>',
    trash: '<path d="M3 6h18M5 6l1 15h12l1-15M9 6V3h6v3M10 10v7M14 10v7"/>',
    monitor: '<rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/>'
  };
  const iconStyles = {
    play: 'red', video: 'red', youtube: 'red', nanook: 'red', waves: 'blue', waveform: 'blue', audio: 'blue', trackhunt: 'blue',
    disc: 'gold', vinyl: 'gold', record: 'gold', surco: 'gold', diamond: 'sand', gem: 'sand', jewelry: 'sand', navarro: 'sand',
    frate: 'coral', snow: 'cyan', snowflake: 'cyan', clima: 'cyan', link: 'gray', globe: 'purple', music: 'blue',
    film: 'purple', sparkles: 'purple', briefcase: 'sand', heart: 'green', house: 'sand', terminal: 'gray', folder: 'gold', grid: 'purple', event: 'coral', palette: 'purple', layout: 'purple', activity: 'green', home: 'sand'
  };
  const iconAliases = { video: 'play', youtube: 'play', nanook: 'play', waveform: 'waves', audio: 'waves', trackhunt: 'waves', vinyl: 'disc', record: 'disc', surco: 'disc', gem: 'diamond', jewelry: 'diamond', navarro: 'diamond', snowflake: 'snow', clima: 'snow', event: 'frate', palette: 'sparkles', layout: 'grid', activity: 'heart', home: 'house' };
  let state = { schemaVersion: 1, apps: [], ideas: [], settings: {}, environment: { native } };
  let view = 'apps';
  let selectedPack = '';
  let category = 'all';
  let query = '';
  let loaded = false;
  let lastDialogFocus = null;
  let toastTimer;
  let pendingImport = null;
  let submitting = false;
  const $ = (selector) => document.querySelector(selector);
  const escapeHTML = (value) => String(value ?? '').replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));
  const normalize = (value) => String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const icon = (name, className = '') => `<svg${className ? ` class="${className}"` : ''} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[iconAliases[name] || name] || paths.grid}</svg>`;
  const uid = () => window.crypto?.randomUUID?.() || `item-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  const appById = (id) => state.apps.find((app) => app.id === id);
  const ideaById = (id) => state.ideas.find((idea) => idea.id === id);
  const clone = (value) => JSON.parse(JSON.stringify(value));
  const discoverCatalog = readDiscoverCatalog(window.LOGIKAPPS_DISCOVER);
  const packCatalog = readPackCatalog(window.LOGIKAPPS_PACKS);
  const sharedTools = [...discoverCatalog, ...packCatalog.flatMap((pack) => pack.tools)];
  const readableDate = (value) => {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? '' : date.toLocaleDateString('es-CL', { day: 'numeric', month: 'short' });
  };

  function bridge(action, payload = {}) {
    return new Promise((resolve, reject) => {
      if (!native) { reject(new Error('Abre LOGIKAPPS para Mac para usar esta función.')); return; }
      const id = uid();
      // System dialogs and launch confirmations remain open until the person responds.
      const awaitsPerson = ['choosePath', 'importData', 'exportData', 'launch'].includes(action);
      const timer = awaitsPerson ? null : window.setTimeout(() => { pending.delete(id); reject(new Error('La app tardó en responder. Inténtalo de nuevo.')); }, 30000);
      pending.set(id, { resolve, reject, timer });
      try { window.webkit.messageHandlers.logikapps.postMessage({ id, action, payload }); }
      catch (error) { clearTimeout(timer); pending.delete(id); reject(error); }
    });
  }

  window.logikappsReply = (reply) => {
    const request = pending.get(reply?.id);
    if (!request) return;
    clearTimeout(request.timer);
    pending.delete(reply.id);
    if (reply.ok) request.resolve(reply.result);
    else request.reject(new Error(typeof reply.error === 'string' ? reply.error : reply.error?.message || 'No se pudo completar la acción.'));
  };


  function saveBrowser(nextState) {
    const checked = validatedState(nextState);
    const serialized = serialize(checked);
    try { localStorage.setItem(STORAGE_KEY, serialized); }
    catch { throw new Error('No hay espacio para guardar. Exporta una copia antes de cerrar esta ventana.'); }
    state = checked;
    return state;
  }

  async function mutate(action, payload) {
    if (native) {
      state = validatedState(await bridge(action, payload));
    } else {
      const next = clone(state);
      if (action === 'saveApp') {
        const index = next.apps.findIndex((app) => app.id === payload.app.id);
        if (index === -1) next.apps.push(payload.app); else next.apps[index] = payload.app;
      } else if (action === 'deleteApp') {
        next.apps = next.apps.filter((app) => app.id !== payload.id);
        next.ideas = next.ideas.map((idea) => idea.appId === payload.id ? { ...idea, appId: '' } : idea);
      } else if (action === 'toggleFavorite') {
        const app = next.apps.find((entry) => entry.id === payload.id);
        if (app) app.favorite = !app.favorite;
      } else if (action === 'saveIdea') {
        const index = next.ideas.findIndex((idea) => idea.id === payload.idea.id);
        if (index === -1) next.ideas.push(payload.idea); else next.ideas[index] = payload.idea;
      } else if (action === 'deleteIdea') next.ideas = next.ideas.filter((idea) => idea.id !== payload.id);
      else throw new Error('Esta acción no está disponible en la vista web.');
      saveBrowser(next);
    }
    render();
  }

  function toast(message, error = false) {
    clearTimeout(toastTimer);
    $('#toast-region').innerHTML = `<div class="toast${error ? ' error' : ''}" role="${error ? 'alert' : 'status'}">${escapeHTML(message)}</div>`;
    toastTimer = setTimeout(() => { $('#toast-region').innerHTML = ''; }, error ? 8000 : 4500);
  }

  function appIcon(app) {
    const name = typeof app.icon === 'string' && app.icon in iconStyles ? app.icon : ({ music: 'waves', business: 'briefcase', personal: 'heart', creative: 'sparkles' }[app.category] || 'grid');
    return `<span class="app-icon tone-${iconStyles[name] || 'purple'}">${icon(name)}</span>`;
  }

  function renderNavigation() {
    const nav = [['packs', 'grid', 'Packs de apps'], ['discover', 'globe', 'Explorar'], ['home', 'home', 'Inicio'], ['apps', 'grid', 'Mis apps'], ['ideas', 'bulb', 'Ideas'], ['favorites', 'star', 'Favoritos']];
    $('#primary-nav').innerHTML = nav.map(([id, symbol, label]) => `<button class="nav-item${view === id ? ' active' : ''}" data-view="${id}"${view === id ? ' aria-current="page"' : ''}>${icon(symbol)}<span>${label}</span>${id === 'apps' && state.apps.length ? `<span class="nav-count">${state.apps.length}</span>` : ''}</button>`).join('');
    $('#collection-nav').innerHTML = Object.entries(categories).map(([id, label]) => `<button class="nav-item${view === 'apps' && category === id ? ' active' : ''}" data-category="${id}">${icon('folder')}<span>${label}</span></button>`).join('');
    $('#settings-link').classList.toggle('active', view === 'settings');
    $('#settings-link').innerHTML = `${icon('settings')}<span>Ajustes</span>`;
    $('#settings-link').setAttribute('aria-current', view === 'settings' ? 'page' : 'false');
  }

  function renderRail() {
    const recentIdeas = [...state.ideas].sort((a, b) => String(b.updatedAt || b.createdAt).localeCompare(String(a.updatedAt || a.createdAt))).slice(0, 2);
    $('#ideas-rail').innerHTML = `<h2 class="rail-title">${icon('bulb')}Próximas ideas</h2><button class="new-idea" data-action="new-idea">${icon('plus')}<span><strong>Nueva idea</strong><small>¿Qué quieres crear ahora?</small></span></button><div class="idea-flow">${Object.entries(ideaStatuses).map(([id, label]) => `<div class="flow-item"><i class="flow-dot"></i><span>${label}</span><span class="flow-count">${state.ideas.filter((idea) => idea.status === id).length}</span></div>`).join('')}</div><div class="rail-divider"></div>${recentIdeas.length ? recentIdeas.map((idea) => `<button class="rail-idea" data-action="edit-idea" data-id="${escapeHTML(idea.id)}"><strong>${escapeHTML(idea.title)}</strong>${idea.description ? `<p>${escapeHTML(idea.description)}</p>` : ''}<span class="badge ${idea.status}">${ideaStatuses[idea.status]}</span></button>`).join('') : '<p class="rail-empty">Ese proyecto que tienes dando vueltas empieza aquí. Guárdalo y dale su próximo paso.</p>'}<button class="text-button" data-view="ideas">Ver todas las ideas ${icon('arrow')}</button><p class="rail-footer">De una idea a tu próxima app.</p>`;
  }

  function appCard(app) {
    const requiresSetup = app.status === 'setup';
    const action = app.kind === 'folder' ? 'reveal' : requiresSetup ? (app.sourcePath ? 'reveal' : 'edit-app') : 'launch';
    const label = app.kind === 'folder' ? 'Ver carpeta' : requiresSetup ? (app.sourcePath ? 'Ver carpeta' : 'Configurar') : app.kind === 'url' ? 'Abrir web' : app.status === 'prototype' ? 'Ver' : 'Lanzar';
    const badge = requiresSetup ? 'Por conectar' : app.status === 'prototype' ? 'Prototipo' : app.kind === 'url' ? 'Web' : 'Local';
    return `<article class="app-card"><div class="card-top">${appIcon(app)}<div class="card-tools"><button class="icon-button favorite-button${app.favorite ? ' selected' : ''}" data-action="favorite" data-id="${escapeHTML(app.id)}" aria-label="${app.favorite ? 'Quitar de' : 'Agregar a'} favoritos: ${escapeHTML(app.name)}" aria-pressed="${Boolean(app.favorite)}" title="${app.favorite ? 'Quitar de favoritos' : 'Agregar a favoritos'}">${icon('star')}</button><button class="icon-button" data-action="edit-app" data-id="${escapeHTML(app.id)}" aria-label="Editar ${escapeHTML(app.name)}" title="Editar acceso">${icon('edit')}</button></div></div><h3>${escapeHTML(app.name)}</h3><p class="app-description">${escapeHTML(app.description || 'Tu herramienta, a un clic.')}</p><div class="card-bottom"><span class="badge${requiresSetup ? ' setup' : app.status === 'prototype' ? ' prototype' : ''}">${badge}</span><button class="button${app.favorite && !requiresSetup ? ' button-primary' : ''}" data-action="${action}" data-id="${escapeHTML(app.id)}" aria-label="${label}: ${escapeHTML(app.name)}">${label}</button></div>${requiresSetup ? '<p class="local-note">Elige cómo abrir esta herramienta.</p>' : ''}</article>`;
  }

  function emptyState(symbol, title, description, action = '', label = '') {
    return `<div class="empty-state">${icon(symbol)}<h2>${escapeHTML(title)}</h2><p>${escapeHTML(description)}</p>${action ? `<button class="button button-primary" data-action="${action}">${escapeHTML(label)}</button>` : ''}</div>`;
  }

  function welcomeState() {
    return `<section class="empty-state welcome-state">${icon('grid')}<p class="eyebrow">Bienvenido a tu espacio</p><h2>Empieza con lo que ya usas.</h2><p>Reúne tus herramientas y guarda las ideas que quieres convertir en apps. Explora las herramientas compartidas o agrega las que ya usas a tu biblioteca personal.</p><div class="welcome-types"><span>${icon('monitor')}App de Mac <small>.app</small></span><span>${icon('globe')}Enlace web</span><span>${icon('terminal')}Lanzador <small>.command</small></span><span>${icon('folder')}Carpeta</span></div><div class="welcome-actions"><button class="button button-primary" data-view="discover">${icon('globe')}Explorar herramientas</button><button class="button" data-action="new-app">${icon('plus')}Agregar una app propia</button><button class="button button-purple" data-action="new-idea">${icon('bulb')}Guardar una idea</button></div><p class="welcome-note">${native ? 'Elige dónde está tu herramienta y ábrela desde aquí.' : 'Los enlaces se abren desde la web. Para lanzar apps y carpetas locales, usa la versión para Mac.'}</p></section>`;
  }

  function filters() {
    return `<div class="filters" role="group" aria-label="Filtrar por colección">${[['all', 'Todas'], ...Object.entries(categories)].map(([id, label]) => `<button class="filter${category === id ? ' active' : ''}" data-filter="${id}" aria-pressed="${category === id}">${label}</button>`).join('')}</div>`;
  }

  function filteredApps() {
    const terms = normalize(query).trim().split(/\s+/).filter(Boolean);
    return state.apps.filter((app) => (view !== 'favorites' || app.favorite) && (category === 'all' || app.category === category) && terms.every((term) => normalize(`${app.name} ${app.description} ${categories[app.category]} ${app.notes || ''}`).includes(term)));
  }

  function filteredIdeas() {
    const terms = normalize(query).trim().split(/\s+/).filter(Boolean);
    return state.ideas.filter((idea) => terms.every((term) => normalize(`${idea.title} ${idea.description} ${ideaStatuses[idea.status]}`).includes(term)));
  }

  function renderApps() {
    const apps = filteredApps();
    const isHome = view === 'home';
    const heading = view === 'favorites' ? 'Tus imprescindibles.' : isHome ? 'Tu próxima idea empieza aquí.' : 'Tus herramientas, a un clic.';
    const intro = view === 'favorites' ? 'Las apps que siempre quieres tener cerca.' : 'Abre tus apps. Dale espacio a tu próxima idea.';
    const recent = [...state.apps].filter((app) => app.lastOpenedAt || app.openedAt).sort((a, b) => String(b.lastOpenedAt || b.openedAt).localeCompare(String(a.lastOpenedAt || a.openedAt))).slice(0, 4);
    const recentHTML = isHome && recent.length && !query ? `<div class="section-heading"><h2>Últimas abiertas</h2>${icon('clock')}</div><div class="recent-list">${recent.map((app) => `<button class="recent-app" data-action="${app.kind === 'folder' ? 'reveal' : app.status === 'setup' ? 'edit-app' : 'launch'}" data-id="${escapeHTML(app.id)}">${appIcon(app)}<span><strong>${escapeHTML(app.name)}</strong><small>${app.kind === 'folder' ? 'Ver carpeta · ' : ''}${readableDate(app.lastOpenedAt || app.openedAt)}</small></span></button>`).join('')}</div><div class="section-heading"><h2>Tu biblioteca</h2><button data-view="apps">Ver todas</button></div>` : '';
    const matchedIdeas = query.trim() ? filteredIdeas() : [];
    const ideaResults = matchedIdeas.length ? `<div class="section-heading"><h2>Ideas encontradas</h2><span class="badge">${matchedIdeas.length}</span></div><div class="app-grid">${matchedIdeas.map((idea) => `<button class="rail-idea" data-action="edit-idea" data-id="${escapeHTML(idea.id)}"><strong>${escapeHTML(idea.title)}</strong>${idea.description ? `<p>${escapeHTML(idea.description)}</p>` : ''}<span class="badge ${idea.status}">${ideaStatuses[idea.status]}</span></button>`).join('')}</div>` : '';
    const noResults = query || category !== 'all' ? emptyState('search', 'No encontramos coincidencias', 'Prueba con otro nombre o vuelve a ver todas tus herramientas.', 'clear-search', 'Limpiar filtros') : view === 'favorites' ? emptyState('star', 'Tu selección personal', 'Marca la estrella de una app para guardarla aquí.', 'view-apps', 'Ver mis apps') : welcomeState();
    $('#main-content').innerHTML = `<div class="page-heading"><p class="eyebrow">${view === 'favorites' ? 'A mano, siempre' : isHome ? 'Bienvenido a LOGIKAPPS' : 'Todo en un lugar'}</p><h1>${heading}</h1><p class="intro">${intro}</p></div>${recentHTML}${filters()}<div class="results-meta"><span>${apps.length} ${apps.length === 1 ? 'herramienta' : 'herramientas'}${query ? ` para “${escapeHTML(query)}”` : ''}</span>${query || category !== 'all' ? '<button data-action="clear-search">Limpiar filtros</button>' : '<span>Hechas para ti</span>'}</div><div class="app-grid">${apps.length ? apps.map(appCard).join('') : noResults}</div>${ideaResults}`;
  }

  function readDiscoverCatalog(source) {
    if (!Array.isArray(source)) return [];
    const ids = new Set();
    const validText = (value, max, required = false) => typeof value === 'string' && value.length <= max && !value.includes('\0') && (!required || Boolean(value.trim()));
    return source.filter((entry) => {
      if (!entry || typeof entry !== 'object' || Array.isArray(entry) || !validText(entry.id, 100, true) || ids.has(entry.id) || !validText(entry.name, 100, true) || !validText(entry.description, 2000) || !Object.prototype.hasOwnProperty.call(categories, entry.category) || !['web', 'download'].includes(entry.kind) || !validText(entry.url, 4096, true) || !validURL(entry.url) || (entry.connectKind !== undefined && !['app', 'command', 'folder'].includes(entry.connectKind)) || (entry.requirements !== undefined && !validText(entry.requirements, 2000))) return false;
      ids.add(entry.id);
      return true;
    }).map((entry) => ({
      id: entry.id, name: entry.name.trim(), description: entry.description.trim(), category: entry.category,
      icon: Object.prototype.hasOwnProperty.call(iconStyles, entry.icon) ? entry.icon : 'grid',
      kind: entry.kind, url: validURL(entry.url), requirements: entry.requirements || '', connectKind: entry.connectKind || 'app'
    }));
  }

  function filteredDiscover() {
    const terms = normalize(query).trim().split(/\s+/).filter(Boolean);
    return discoverCatalog.filter((entry) => (category === 'all' || category === entry.category) && terms.every((term) => normalize(`${entry.name} ${entry.description} ${categories[entry.category]} ${entry.requirements}`).includes(term)));
  }

  function readPackCatalog(source) {
    if (!Array.isArray(source)) return [];
    const ids = new Set();
    const text = (value, max) => typeof value === 'string' && value.trim() && value.length <= max && !value.includes('\0');
    return source.filter((pack) => {
      if (!pack || !text(pack.id, 100) || ids.has(pack.id) || !text(pack.name, 100) || !text(pack.description, 2000) || !text(pack.requirements, 2000) || !text(pack.version, 40) || !validURL(pack.url) || !Object.hasOwn(categories, pack.category) || !Array.isArray(pack.tools) || !pack.tools.length || pack.tools.length > 30 || !Array.isArray(pack.steps) || !pack.steps.length || pack.steps.length > 8 || !pack.steps.every((step) => text(step, 1000))) return false;
      const tools = readDiscoverCatalog(pack.tools);
      if (tools.length !== pack.tools.length) return false;
      ids.add(pack.id);
      return true;
    }).map((pack) => ({ id: pack.id, name: pack.name, description: pack.description, requirements: pack.requirements, version: pack.version, url: validURL(pack.url), category: pack.category, icon: Object.hasOwn(iconStyles, pack.icon) ? pack.icon : 'grid', tools: readDiscoverCatalog(pack.tools), steps: [...pack.steps] }));
  }

  function filteredPacks() {
    const terms = normalize(query).trim().split(/\s+/).filter(Boolean);
    return packCatalog.filter((pack) => (category === 'all' || category === pack.category) && terms.every((term) => normalize(`${pack.name} ${pack.description} ${pack.requirements} ${pack.tools.map((tool) => `${tool.name} ${tool.description}`).join(' ')}`).includes(term)));
  }

  function packCard(pack) {
    return `<article class="pack-card pack-${escapeHTML(pack.category)}"><div class="card-top">${appIcon(pack)}<span class="badge">${pack.tools.length} herramientas · ${escapeHTML(pack.version)}</span></div><h2>${escapeHTML(pack.name)}</h2><p class="pack-description">${escapeHTML(pack.description)}</p><div class="pack-tools">${pack.tools.map((tool) => `<span>${icon(tool.icon)}${escapeHTML(tool.name)}</span>`).join('')}</div><p class="discover-requirements">${escapeHTML(pack.requirements)}</p><div class="pack-actions"><button class="button button-primary" data-action="view-pack" data-id="${escapeHTML(pack.id)}">Ver contenido ${icon('arrow')}</button><a class="button" href="${escapeHTML(pack.url)}" target="_blank" rel="noopener noreferrer">${icon('download')}Descargar pack</a></div></article>`;
  }

  function renderPacks() {
    const pack = packCatalog.find((entry) => entry.id === selectedPack);
    if (pack) {
      $('#main-content').innerHTML = `<button class="text-button pack-back" data-view="packs">${icon('arrow')}Todos los packs</button><div class="page-heading"><p class="eyebrow">${pack.tools.length} herramientas · ${escapeHTML(pack.version)}</p><div class="heading-row"><div><h1>${escapeHTML(pack.name)}</h1><p class="intro">${escapeHTML(pack.description)}</p></div><a class="button button-primary" href="${escapeHTML(pack.url)}" target="_blank" rel="noopener noreferrer">${icon('download')}Descargar pack</a></div></div><section class="pack-start"><h2>Empieza aquí</h2><ol>${pack.steps.map((step) => `<li>${escapeHTML(step)}</li>`).join('')}</ol><p>${escapeHTML(pack.requirements)}</p></section><div class="section-heading"><h2>Dentro de este pack</h2><span>${pack.tools.length} herramientas</span></div><div class="app-grid discover-grid">${pack.tools.map(discoverCard).join('')}</div>`;
      return;
    }
    const packs = filteredPacks();
    $('#main-content').innerHTML = `<div class="page-heading"><p class="eyebrow">Tu próximo proyecto, equipado</p><h1>Un pack. Todo para empezar.</h1><p class="intro">Descarga tus herramientas por actividad, con sus lanzadores, accesos e instrucciones en una misma carpeta.</p></div>${filters()}<div class="results-meta"><span>${packs.length} ${packs.length === 1 ? 'pack disponible' : 'packs disponibles'}</span><span>Elige · Descarga · Prepara</span></div><div class="pack-grid">${packs.length ? packs.map(packCard).join('') : emptyState('search', 'No encontramos packs', 'Prueba con otra herramienta o colección.', 'clear-search', 'Limpiar filtros')}</div><div class="discover-note">${icon('folder')}<span><strong>Cada pack incluye una guía de inicio.</strong> Los accesos se agregan a Mis apps cuando tú los conectas. Las herramientas web conservan sus cuentas y permisos propios.</span></div>`;
  }

  function connectedDiscover(entry) {
    return entry.kind === 'web' && state.apps.some((app) => app.kind === 'url' && validURL(app.target) === entry.url);
  }

  function discoverCard(entry) {
    const added = connectedDiscover(entry);
    const busy = discoverAdding.has(entry.url);
    const download = entry.kind === 'download';
    const connectLabel = { app: 'Conectar app', command: 'Conectar lanzador', folder: 'Conectar carpeta' }[entry.connectKind];
    return `<article class="app-card discover-card"><div class="card-top">${appIcon(entry)}<span class="badge">${download ? 'Descarga' : 'Web'}</span></div><h3>${escapeHTML(entry.name)}</h3><p class="app-description">${escapeHTML(entry.description)}</p>${entry.requirements ? `<p class="discover-requirements">${escapeHTML(entry.requirements)}</p>` : ''}<div class="discover-actions"><a class="button button-primary" href="${escapeHTML(entry.url)}" target="_blank" rel="noopener noreferrer">${icon(download ? 'download' : 'external')}${download ? 'Ver descarga' : 'Abrir web'}</a><button class="button${added ? ' button-quiet' : ''}" data-action="${download ? 'connect-discover' : 'add-discover'}" data-id="${escapeHTML(entry.id)}"${added || busy ? ' disabled' : ''}>${icon(added ? 'grid' : 'plus')}${download ? connectLabel : added ? 'Ya está en Mis apps' : busy ? 'Agregando…' : 'Agregar a Mis apps'}</button></div></article>`;
  }

  function renderDiscover() {
    const entries = filteredDiscover();
    const empty = discoverCatalog.length
      ? emptyState('search', 'No encontramos coincidencias', 'Prueba con otro nombre o vuelve a ver todas las herramientas compartidas.', 'clear-search', 'Limpiar filtros')
      : `<section class="empty-state discover-empty">${icon('globe')}<h2>Pronto habrá más por explorar.</h2><p>Puedes consultar la guía pública de LOGIKAPPS y empezar agregando una herramienta que ya uses.</p><div class="welcome-actions"><a class="button button-primary" href="${publicGuide}" target="_blank" rel="noopener noreferrer">${icon('external')}Ver guía de LOGIKAPPS</a><button class="button" data-action="new-app">${icon('plus')}Agregar una app propia</button></div></section>`;
    $('#main-content').innerHTML = `<div class="page-heading discover-heading"><p class="eyebrow">La selección de LOGIKAPPS</p><h1>Descubre lo que puedes usar.</h1><p class="intro">Este catálogo compartido está disponible en todos los Mac con esta versión. Abre una herramienta web o consulta su descarga y agrégala a tu espacio.</p><div class="discover-note">${icon('grid')}<span><strong>Mis apps es tu biblioteca personal.</strong> Tú eliges qué agregar. Para conectar una descarga, prepárala en tu Mac y selecciona su app, lanzador o carpeta.</span><button class="text-button" data-view="apps">Ver Mis apps ${icon('arrow')}</button></div></div>${filters()}<div class="results-meta"><span>${entries.length} ${entries.length === 1 ? 'herramienta compartida' : 'herramientas compartidas'}${query ? ` para “${escapeHTML(query)}”` : ''}</span>${query || category !== 'all' ? '<button data-action="clear-search">Limpiar filtros</button>' : '<span>Elige lo que te sirve</span>'}</div><div class="app-grid discover-grid">${entries.length ? entries.map(discoverCard).join('') : empty}</div>`;
  }

  async function addDiscover(id) {
    const entry = sharedTools.find((item) => item.id === id && item.kind === 'web');
    if (!entry) throw new Error('Esta herramienta ya no está disponible en el catálogo.');
    if (connectedDiscover(entry)) { toast('Esta herramienta ya está en Mis apps.'); return; }
    if (discoverAdding.has(entry.url)) return;
    discoverAdding.add(entry.url);
    try {
      await mutate('saveApp', { app: { id: uid(), name: entry.name, description: entry.description, category: entry.category, icon: entry.icon, kind: 'url', target: entry.url, status: 'ready', favorite: false } });
      toast('Herramienta agregada a Mis apps.');
    } finally { discoverAdding.delete(entry.url); render(); }
  }

  function connectDiscover(id) {
    const entry = sharedTools.find((item) => item.id === id && item.kind === 'download');
    if (!entry) throw new Error('Esta descarga ya no está disponible en el catálogo.');
    openAppEditor('', { name: entry.name, description: entry.description, category: entry.category, icon: entry.icon, kind: entry.connectKind, target: '' });
  }

  function renderIdeas() {
    const ideas = filteredIdeas();
    $('#main-content').innerHTML = `<div class="page-heading"><p class="eyebrow">De la idea a la acción</p><div class="heading-row"><div><h1>Un lugar para lo que viene.</h1><p class="intro">Captura una idea, dale forma y conecta su app cuando esté lista.</p></div><button class="button button-purple" data-action="new-idea">${icon('plus')}Nueva idea</button></div></div>${query ? `<div class="results-meta"><span>${ideas.length} ${ideas.length === 1 ? 'idea encontrada' : 'ideas encontradas'}</span><button data-action="clear-search">Limpiar búsqueda</button></div>` : ''}<div class="idea-board">${Object.entries(ideaStatuses).map(([status, label]) => { const entries = ideas.filter((idea) => idea.status === status).sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || ''))); return `<section class="idea-column"><h2 class="idea-column-title">${label}<span>${entries.length}</span></h2>${entries.length ? entries.map((idea) => { const linked = appById(idea.appId); return `<article class="idea-card"><div class="idea-card-top"><h3>${escapeHTML(idea.title)}</h3><button class="icon-button" data-action="edit-idea" data-id="${escapeHTML(idea.id)}" aria-label="Editar idea: ${escapeHTML(idea.title)}">${icon('edit')}</button></div>${idea.description ? `<p>${escapeHTML(idea.description)}</p>` : ''}${linked ? `<button class="text-button idea-linked" data-action="${linked.kind === 'folder' ? 'reveal' : linked.status === 'setup' ? 'edit-app' : 'launch'}" data-id="${escapeHTML(linked.id)}">${icon(linked.kind === 'folder' ? 'folder' : 'link')}${linked.kind === 'folder' ? 'Carpeta · ' : ''}${escapeHTML(linked.name)}</button>` : ''}<span class="idea-date">${readableDate(idea.updatedAt || idea.createdAt)}</span></article>`; }).join('') : `<p class="column-empty">${status === 'idea' ? 'Guarda aquí esa primera chispa.' : status === 'development' ? 'Las ideas que estás construyendo.' : 'Tus ideas convertidas en herramientas.'}</p>`}</section>`; }).join('')}</div>`;
  }

  function renderSettings() {
    $('#main-content').innerHTML = `<div class="page-heading"><p class="eyebrow">Tu espacio, a tu manera</p><h1>Todo bajo tu control.</h1><p class="intro">Tus accesos e ideas se guardan ${native ? 'en este Mac' : 'en este navegador'}.</p></div><div class="settings-grid"><section class="settings-card"><h2>${icon('shield')}Datos personales</h2><p>LOGIKAPPS conserva tu biblioteca, favoritos e ideas en tu equipo. Los accesos apuntan a tus herramientas: quitarlos de aquí no elimina tus apps.</p><ul><li>${state.apps.length} apps en tu biblioteca</li><li>${state.ideas.length} ideas guardadas</li><li>${state.apps.filter((app) => app.favorite).length} favoritas</li></ul>${native && state.environment.dataPath ? `<span class="settings-value">${escapeHTML(state.environment.dataPath)}</span><button class="button" data-action="open-data">${icon('folder')}Ver carpeta de datos</button>` : ''}</section><section class="settings-card"><h2>${icon('download')}Copias y traslado</h2><p>Exporta tus accesos e ideas para tener una copia. Al importar, se guardará una copia previa y se reemplazará la biblioteca actual. Las apps y sus archivos permanecen en su ubicación. Si compartes una copia, quien la reciba deberá ajustar las rutas a su propio Mac; la copia no incluye tus apps.</p><div class="settings-actions"><button class="button button-primary" data-action="export">${icon('download')}Exportar copia</button><button class="button" data-action="import">${icon('upload')}Importar copia</button>${!native && browserBackupAvailable() ? `<button class="button button-quiet" data-action="export-previous">${icon('download')}Descargar copia anterior</button>` : ''}</div></section><section class="settings-card"><h2>${icon('monitor')}${native ? 'Lista para tu Mac' : 'Vista web'}</h2><p>${native ? 'Abre LOGIKAPPS desde Aplicaciones o déjala en el Dock. Desde aquí puedes abrir apps, carpetas, enlaces y accesos locales que hayas configurado.' : 'Puedes organizar tu biblioteca e ideas aquí. Para abrir herramientas locales, usa LOGIKAPPS para Mac. Los datos de esta vista web y de la app se guardan por separado; usa una copia para trasladarlos.'}</p><span class="badge ${native ? 'ready' : ''}">${native ? 'App de Mac' : 'Guardado en el navegador'}</span></section><section class="settings-card"><h2>${icon('bulb')}De una idea a una app</h2><p>Guarda el nombre y la intención de tu proyecto en Ideas. Cuando avances, cambia su estado. Al tener una herramienta lista, agrégala a la biblioteca y vincúlala con su idea.</p><button class="button button-purple" data-action="new-idea">${icon('plus')}Guardar una idea</button></section></div>`;
  }

  function render() {
    renderNavigation();
    if (!loaded) return;
    const wide = view === 'ideas' || view === 'settings' || view === 'discover' || view === 'packs';
    $('.content-layout').classList.toggle('full-width', wide);
    $('#ideas-rail').hidden = wide;
    if (view === 'packs') renderPacks();
    else if (view === 'discover') renderDiscover();
    else if (view === 'ideas') renderIdeas();
    else if (view === 'settings') renderSettings();
    else renderApps();
    renderRail();
    $('#version-label').textContent = `· ${state.environment.version || '0.4.0'}`;
  }

  function changeView(next, nextCategory = 'all') {
    view = ['packs', 'discover', 'home', 'apps', 'ideas', 'favorites', 'settings'].includes(next) ? next : 'apps';
    selectedPack = '';
    category = nextCategory;
    query = '';
    $('#search').value = '';
    render();
    window.scrollTo({ top: 0, behavior: 'auto' });
  }

  function openDialog(content) {
    const dialog = $('#editor-dialog');
    if (!dialog.open) lastDialogFocus = document.activeElement;
    $('#dialog-content').innerHTML = content;
    if (!dialog.open) dialog.showModal();
    requestAnimationFrame(() => { const target = dialog.querySelector('[autofocus]') || dialog.querySelector('input, textarea, select, button'); target?.focus(); });
  }

  function closeDialog() {
    if (submitting) return;
    $('#editor-dialog').close();
    pendingImport = null;
    lastDialogFocus?.focus();
  }

  function dialogHeader(title) {
    return `<header class="dialog-header"><h2 id="dialog-title">${escapeHTML(title)}</h2><button type="button" class="icon-button" data-action="close-dialog" aria-label="Cerrar">${icon('close')}</button></header>`;
  }

  function options(entries, selected) {
    return entries.map(([value, label]) => `<option value="${escapeHTML(value)}"${value === selected ? ' selected' : ''}>${escapeHTML(label)}</option>`).join('');
  }

  function openAppEditor(id = '', prefill = null) {
    const existing = appById(id);
    const app = existing || { name: '', description: '', category: category === 'all' ? 'personal' : category, kind: 'url', target: '', status: 'ready', icon: 'grid', favorite: false, notes: '', ...(prefill || {}) };
    const kinds = [['url', 'Enlace web'], ['app', 'App de Mac'], ['command', 'Acceso local (.command)'], ['folder', 'Carpeta']];
    if (app.kind === 'managed') kinds.push(['managed', 'Herramienta integrada']);
    openDialog(`<form id="app-form" data-id="${escapeHTML(id)}">${dialogHeader(existing ? 'Editar acceso' : 'Agregar una app')}<div class="dialog-body"><p class="dialog-description">${existing ? 'Organiza cómo aparece y se abre esta herramienta en tu espacio.' : prefill ? 'Después de preparar la descarga en tu Mac, elige su app, lanzador o carpeta para conectarla a tu biblioteca.' : 'Conecta una herramienta que ya tienes: su app, una carpeta o su enlace.'}</p><div class="form-grid"><label class="form-field full">Nombre<input name="name" required maxlength="100" value="${escapeHTML(app.name)}" placeholder="Nombre de tu herramienta" autofocus></label><label class="form-field full">Descripción<textarea name="description" maxlength="2000" rows="2" placeholder="¿Para qué la usas?">${escapeHTML(app.description)}</textarea></label><label class="form-field">Colección<select name="category">${options(Object.entries(categories), app.category)}</select></label><label class="form-field">Tipo de acceso<select name="kind" id="app-kind">${options(kinds, app.kind)}</select></label><label class="form-field full"><span id="target-label">Enlace</span><span class="input-action"><input name="target" id="app-target" value="${escapeHTML(app.target)}" maxlength="4096"><button type="button" class="button" data-action="choose-path" id="choose-path">${icon('folder')}Elegir</button></span><small id="target-help"></small></label><label class="form-field">Estado<select name="status">${options([['ready', 'Lista para abrir'], ['prototype', 'Prototipo'], ['setup', 'Por conectar']], app.status)}</select></label><label class="form-field">Icono<select name="icon">${options([['grid', 'Apps'], ['play', 'Video'], ['waves', 'Audio'], ['disc', 'Vinilo'], ['diamond', 'Joyería'], ['frate', 'Evento'], ['snow', 'Climatización'], ['link', 'Enlace'], ['globe', 'Web'], ['music', 'Música'], ['film', 'Película'], ['sparkles', 'Creatividad'], ['briefcase', 'Negocios'], ['heart', 'Bienestar'], ['house', 'Casa'], ['terminal', 'Herramienta'], ['folder', 'Carpeta']], iconAliases[app.icon] || app.icon)}</select></label><label class="form-field full">Notas <small>(opcional)</small><textarea name="notes" rows="2" maxlength="4096" placeholder="Algo que quieras recordar sobre esta app…">${escapeHTML(app.notes || '')}</textarea></label><label class="check-field"><input name="favorite" type="checkbox"${app.favorite ? ' checked' : ''}>Guardar en favoritos</label></div><p class="form-error" id="form-error" role="alert" hidden></p></div><footer class="dialog-footer">${existing ? `<button type="button" class="button delete-item" data-action="ask-delete-app" data-id="${escapeHTML(id)}">Quitar acceso</button>` : ''}<button type="button" class="button button-quiet" data-action="close-dialog">Cancelar</button><button type="submit" class="button button-primary">${existing ? 'Guardar cambios' : 'Agregar app'}</button></footer></form>`);
    updateTargetField();
  }

  function updateTargetField() {
    const kind = $('#app-kind')?.value;
    if (!kind) return;
    const isURL = kind === 'url';
    const managed = kind === 'managed';
    $('#target-label').textContent = isURL ? 'Enlace' : managed ? 'Acceso integrado' : 'Ubicación';
    $('#app-target').type = isURL ? 'url' : 'text';
    $('#app-target').placeholder = isURL ? 'https://tu-herramienta.com' : '/Users/tu-usuario/Aplicaciones/Mi app.app';
    $('#app-target').readOnly = managed;
    $('#choose-path').hidden = isURL || managed || !native;
    $('#target-help').textContent = isURL ? 'Usa un enlace que empiece por https:// o http://.' : managed ? 'Este acceso está preparado por LOGIKAPPS.' : native ? 'Elige la app, el acceso .command o la carpeta en tu Mac.' : 'Puedes guardar la ubicación. Para abrirla necesitarás LOGIKAPPS para Mac.';
  }

  function openIdeaEditor(id = '') {
    const existing = ideaById(id);
    const idea = existing || { title: '', description: '', status: 'idea', appId: '' };
    openDialog(`<form id="idea-form" data-id="${escapeHTML(id)}">${dialogHeader(existing ? 'Dale forma a tu idea' : 'Guarda tu próxima idea')}<div class="dialog-body"><p class="dialog-description">Un nombre, una intención y el siguiente paso. Empieza por lo que tengas.</p><div class="form-grid"><label class="form-field full">Tu idea<input name="title" required maxlength="160" value="${escapeHTML(idea.title)}" placeholder="¿Qué quieres crear?" autofocus></label><label class="form-field full">¿Qué te gustaría que hiciera?<textarea name="description" maxlength="16000" rows="5" placeholder="Describe la idea y para quién sería útil…">${escapeHTML(idea.description)}</textarea></label><label class="form-field">Etapa<select name="status">${options(Object.entries(ideaStatuses), idea.status)}</select></label><label class="form-field">App relacionada<select name="appId">${options([['', 'Todavía sin app'], ...state.apps.map((app) => [app.id, app.name])], idea.appId || '')}</select><small>Vincúlala cuando agregues su app a tu biblioteca.</small></label></div><p class="form-error" id="form-error" role="alert" hidden></p></div><footer class="dialog-footer">${existing ? `<button type="button" class="button delete-item" data-action="ask-delete-idea" data-id="${escapeHTML(id)}">Eliminar idea</button>` : ''}<button type="button" class="button button-quiet" data-action="close-dialog">Cancelar</button><button type="submit" class="button button-primary">${existing ? 'Guardar cambios' : 'Guardar idea'}</button></footer></form>`);
  }

  function confirmDelete(type, id) {
    const entry = type === 'app' ? appById(id) : ideaById(id);
    if (!entry) return;
    openDialog(`${dialogHeader(type === 'app' ? 'Quitar este acceso' : 'Eliminar esta idea')}<div class="dialog-body"><p class="dialog-description">${type === 'app' ? `Se quitará “${escapeHTML(entry.name)}” de tu biblioteca. La app y sus archivos seguirán en tu Mac.` : `Se eliminará “${escapeHTML(entry.title)}” de tus ideas. Esta acción no se puede deshacer.`}</p><p class="form-error" id="form-error" role="alert" hidden></p></div><footer class="dialog-footer"><button class="button button-quiet" data-action="edit-${type}" data-id="${escapeHTML(id)}">Volver</button><button class="button button-danger" data-action="delete-${type}" data-id="${escapeHTML(id)}">${type === 'app' ? 'Quitar acceso' : 'Eliminar idea'}</button></footer>`);
  }

  async function submitApp(form) {
    const values = new FormData(form);
    const id = form.dataset.id;
    const existing = appById(id);
    const kind = values.get('kind');
    let target = String(values.get('target') || '').trim();
    const status = values.get('status');
    const name = String(values.get('name')).trim();
    if (!name) throw new Error('Escribe un nombre para tu app.');
    if (kind === 'url' && target) {
      target = validURL(target);
      if (!target) throw new Error('Revisa el enlace. Debe comenzar con https:// o http://.');
    }
    if (!target) throw new Error('Elige la app, una carpeta o su enlace. Si aún es una idea, guárdala en Ideas.');
    if (kind !== 'url' && kind !== 'managed' && target && !target.startsWith('/')) throw new Error('La ubicación debe ser una ruta completa de tu Mac, que comience con /.');
    if (kind === 'app' && !/\.app\/?$/i.test(target)) throw new Error('Elige una aplicación de Mac con extensión .app.');
    if (kind === 'command' && !/\.command$/i.test(target)) throw new Error('Elige un lanzador con extensión .command.');
    const app = { ...(existing || {}), id: id || uid(), name, description: String(values.get('description')).trim(), category: values.get('category'), kind, target, status, icon: values.get('icon'), favorite: values.get('favorite') === 'on', notes: String(values.get('notes')).trim() };
    if (kind === 'folder') app.sourcePath = target;
    else if (existing?.kind === 'folder') delete app.sourcePath;
    await mutate('saveApp', { app });
    return existing ? 'Acceso actualizado.' : 'App agregada a tu espacio.';
  }

  async function submitIdea(form) {
    const values = new FormData(form);
    const id = form.dataset.id;
    const existing = ideaById(id);
    const title = String(values.get('title')).trim();
    if (!title) throw new Error('Ponle un nombre a tu idea.');
    const now = new Date().toISOString();
    const idea = { ...(existing || {}), id: id || uid(), title, description: String(values.get('description')).trim(), status: values.get('status'), appId: values.get('appId') || '', createdAt: existing?.createdAt || now, updatedAt: now };
    await mutate('saveIdea', { idea });
    return existing ? 'Idea actualizada.' : 'Tu idea ya tiene un lugar.';
  }

  async function launch(id) {
    const app = appById(id);
    if (!app) throw new Error('Esta app ya no está en tu biblioteca.');
    if (app.status === 'setup') { openAppEditor(id); return; }
    let openedAt;
    if (native) {
      const result = await bridge('launch', { id });
      openedAt = result.openedAt || new Date().toISOString();
      toast(result.message || `Se abrió ${app.name}.`);
    } else if (app.kind === 'url') {
      const url = validURL(app.target);
      if (!url) throw new Error('Revisa el enlace de esta app antes de abrirla.');
      const link = document.createElement('a');
      link.href = url;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      link.click();
      openedAt = new Date().toISOString();
    } else {
      toast('Abre LOGIKAPPS para Mac para lanzar tus herramientas locales.');
      return;
    }
    const next = clone(state);
    const updatedApp = next.apps.find((entry) => entry.id === id);
    if (updatedApp) updatedApp.lastOpenedAt = openedAt;
    if (native) state = next; else saveBrowser(next);
    render();
  }

  function exportBrowser(source = state, previous = false) {
    const { environment, ...data } = source;
    const blob = new Blob([serialize(data)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `LOGIKAPPS-${previous ? 'copia-anterior' : 'copia'}-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast('La copia está preparada para descargar.');
  }

  function browserBackupAvailable() {
    try { return Boolean(localStorage.getItem(BACKUP_KEY)); } catch { return false; }
  }

  function importBrowser(nextState) {
    const checked = validatedState(nextState);
    serialize(checked);
    const { environment, ...current } = state;
    // Never replace the active library unless a durable copy of it was saved first.
    try { localStorage.setItem(BACKUP_KEY, serialize(current)); }
    catch { throw new Error('No hay espacio para guardar la copia previa. Exporta tu biblioteca y libera espacio en el navegador antes de importar. Tu biblioteca sigue intacta.'); }
    return saveBrowser({ ...checked, environment: { native: false } });
  }

  async function importFile(file) {
    pendingImport = null;
    if (file.size > MAX_BYTES) throw new Error('La copia es demasiado grande. El máximo es 8 MB.');
    const checked = parseImport(await file.text());
    pendingImport = checked;
    openDialog(`${dialogHeader('Importar tu biblioteca')}<div class="dialog-body"><p class="dialog-description">Esta copia contiene ${pendingImport.apps.length} apps y ${pendingImport.ideas.length} ideas. Reemplazará lo que tienes en esta vista web. Guardaremos una copia previa, que podrás descargar en Ajustes. Tus apps y sus archivos no se modifican. Las rutas locales pueden necesitar ajustes si la copia viene de otro Mac.</p><p class="form-error" id="form-error" role="alert" hidden></p></div><footer class="dialog-footer"><button class="button button-quiet" data-action="close-dialog">Cancelar</button><button class="button button-primary" data-action="confirm-import">Reemplazar biblioteca</button></footer>`);
  }

  async function handleAction(action, id) {
    switch (action) {
      case 'view-pack':
        if (!packCatalog.some((pack) => pack.id === id)) throw new Error('Este pack ya no está disponible.');
        changeView('packs'); selectedPack = id; render(); break;
      case 'new-app': openAppEditor(); break;
      case 'add-discover': await addDiscover(id); break;
      case 'connect-discover': connectDiscover(id); break;
      case 'edit-app': openAppEditor(id); break;
      case 'new-idea': openIdeaEditor(); break;
      case 'edit-idea': openIdeaEditor(id); break;
      case 'close-dialog': closeDialog(); break;
      case 'ask-delete-app': confirmDelete('app', id); break;
      case 'ask-delete-idea': confirmDelete('idea', id); break;
      case 'delete-app': await mutate('deleteApp', { id }); closeDialog(); toast('Acceso quitado de tu biblioteca.'); break;
      case 'delete-idea': await mutate('deleteIdea', { id }); closeDialog(); toast('Idea eliminada.'); break;
      case 'favorite': await mutate('toggleFavorite', { id }); break;
      case 'launch': await launch(id); break;
      case 'reveal': {
        if (!native) { toast('Abre LOGIKAPPS para Mac para ver la carpeta de esta herramienta.'); break; }
        const result = await bridge('reveal', { id });
        toast(result.message || 'Carpeta abierta en Finder.');
        break;
      }
      case 'clear-search': query = ''; category = 'all'; $('#search').value = ''; render(); break;
      case 'view-apps': changeView('apps'); break;
      case 'choose-path': {
        const result = await bridge('choosePath');
        if (!result.cancelled && result.path) {
          $('#app-target').value = result.path;
          if (/\.app\/?$/i.test(result.path)) $('#app-kind').value = 'app';
          else if (/\.command$/i.test(result.path)) $('#app-kind').value = 'command';
          else $('#app-kind').value = 'folder';
          updateTargetField();
        }
        break;
      }
      case 'export': {
        if (!native) { exportBrowser(); break; }
        const result = await bridge('exportData');
        if (!result.cancelled) toast('Copia guardada.');
        break;
      }
      case 'export-previous': {
        const previous = localStorage.getItem(BACKUP_KEY);
        if (!previous) throw new Error('Todavía no hay una copia previa a la importación.');
        exportBrowser(parseImport(previous), true);
        break;
      }
      case 'import': {
        if (!native) { $('#import-file').value = ''; $('#import-file').click(); break; }
        const result = await bridge('importData');
        if (!result.cancelled) { state = validatedState(result); render(); toast('Biblioteca importada.'); }
        break;
      }
      case 'confirm-import': {
        if (!pendingImport) break;
        importBrowser(pendingImport);
        closeDialog(); render(); toast('Biblioteca importada.'); break;
      }
      case 'open-data': await bridge('openDataFolder'); toast('Carpeta de datos abierta.'); break;
      case 'retry-load': await load(); break;
      default: break;
    }
  }

  function displayError(error) {
    const message = error?.message || 'No se pudo completar la acción. Inténtalo de nuevo.';
    if ($('#editor-dialog').open && $('#form-error')) { $('#form-error').hidden = false; $('#form-error').textContent = message; }
    else toast(message, true);
  }

  async function load() {
    $('#add-app-button').disabled = true;
    $('#main-content').innerHTML = '<div class="loading-state"><span class="loading-dot"></span>Preparando tu espacio…</div>';
    try {
      if (native) state = validatedState(await bridge('getState'));
      else {
        const saved = localStorage.getItem(STORAGE_KEY);
        if (saved) {
          try { state = parseImport(saved); }
          catch { throw new Error('No pudimos leer los datos guardados de esta vista web. Consérvalos y recupera una copia antes de reemplazarlos.'); }
        } else {
          state = validatedState({ schemaVersion: 1, apps: window.LOGIKAPPS_CATALOG || [], ideas: [], settings: {}, environment: { native: false } });
          saveBrowser(state);
        }
      }
      if (!loaded && state.apps.length === 0) view = packCatalog.length ? 'packs' : 'discover';
      loaded = true;
      $('#add-app-button').disabled = false;
      render();
    } catch (error) {
      loaded = false;
      $('#main-content').innerHTML = emptyState('folder', 'Tu espacio no terminó de cargar', error.message, 'retry-load', 'Volver a intentar');
      $('#ideas-rail').hidden = true;
      $('.content-layout').classList.add('full-width');
    }
  }

  document.addEventListener('click', async (event) => {
    const button = event.target.closest('button');
    if (!button || button.disabled) return;
    if (button.dataset.view) { changeView(button.dataset.view); return; }
    if (button.dataset.category) { changeView('apps', button.dataset.category); return; }
    if (button.dataset.filter) { category = button.dataset.filter; render(); return; }
    if (!button.dataset.action) return;
    if (!loaded && button.dataset.action !== 'retry-load') return;
    button.disabled = true;
    try { await handleAction(button.dataset.action, button.dataset.id || ''); }
    catch (error) { displayError(error); }
    finally { if (button.isConnected) button.disabled = false; }
  });

  document.addEventListener('submit', async (event) => {
    const form = event.target;
    if (!['app-form', 'idea-form'].includes(form.id)) return;
    event.preventDefault();
    if (submitting || !form.reportValidity()) return;
    submitting = true;
    const button = form.querySelector('[type="submit"]');
    button.disabled = true;
    $('#form-error').hidden = true;
    try {
      const message = await (form.id === 'app-form' ? submitApp(form) : submitIdea(form));
      submitting = false;
      closeDialog();
      toast(message);
    } catch (error) { displayError(error); }
    finally { submitting = false; if (button.isConnected) button.disabled = false; }
  });

  document.addEventListener('change', (event) => { if (event.target.id === 'app-kind') updateTargetField(); });
  $('#search').addEventListener('input', (event) => {
    query = event.target.value;
    if (view === 'packs') selectedPack = '';
    if (view === 'settings') view = 'apps';
    render();
  });
  $('#import-file').addEventListener('change', async (event) => { const file = event.target.files?.[0]; if (file) { try { await importFile(file); } catch (error) { displayError(error); } } });
  document.addEventListener('keydown', (event) => {
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
      event.preventDefault();
      if ($('#editor-dialog').open) return;
      $('#search').focus();
      $('#search').select();
    }
  });
  $('#editor-dialog').addEventListener('cancel', (event) => { event.preventDefault(); closeDialog(); });
  $('.brand').addEventListener('click', (event) => { event.preventDefault(); changeView('apps'); });
  $('#search-icon').innerHTML = icon('search');
  $('#add-app-button').innerHTML = `${icon('plus')}Agregar app`;
  document.body.classList.toggle('native', native);
  $('#environment-label').textContent = native ? 'Guardado en este Mac' : 'Vista web · datos en este navegador';
  if (!native) {
    $('#mode-notice').hidden = false;
    $('#mode-notice').textContent = 'Vista web · Abre la app de Mac para lanzar herramientas locales. Aquí puedes organizar tu biblioteca e ideas; los enlaces web sí se abren.';
  }
  renderNavigation();
  load();
})();
