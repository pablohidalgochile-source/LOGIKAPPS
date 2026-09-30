'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { randomUUID } = require('node:crypto');
const { resolveObjectURL } = require('node:buffer');
const core = require('../web/state.js');
const root = path.resolve(__dirname, '..');
const storageKey = 'logikapps.state.v1';
const backupKey = 'logikapps.state.before-import.v1';
const blank = () => ({ schemaVersion: 1, apps: [], ideas: [], settings: {} });
const app = (overrides = {}) => ({ id: 'one', name: 'Música personal', description: 'Edición de audio', category: 'music', kind: 'url', target: 'https://example.com', status: 'ready', favorite: false, ...overrides });
const idea = (overrides = {}) => ({ id: 'idea', title: 'Una idea', description: '', status: 'idea', ...overrides });
const library = (apps = [], ideas = []) => ({ ...blank(), apps, ideas });

function harness({ stored, native = false, initial = blank(), discover = [], packs = [] } = {}) {
  const elements = new Map();
  const listeners = new Map();
  const timers = new Map();
  const requests = [];
  const links = [];
  const storage = new Map(stored ? Object.entries(stored) : []);
  let failKey = '';
  let timerId = 0;
  class Element {
    constructor(selector) { this.selector = selector; this.value = ''; this.dataset = {}; this.innerHTML = ''; this.hidden = false; this.open = false; this.disabled = false; this.isConnected = true; this.attributes = {}; this.classes = new Set(); this.classList = { toggle: (name, force) => force ? this.classes.add(name) : this.classes.delete(name), add: (name) => this.classes.add(name) }; }
    setAttribute(key, value) { this.attributes[key] = value; }
    addEventListener(name, fn) { listeners.set(`${this.selector}:${name}`, fn); }
    querySelector(selector) { return get(`${this.selector} ${selector}`); }
    focus() { document.activeElement = this; }
    select() {}
    showModal() { this.open = true; }
    close() { this.open = false; }
    click() { if (this.selector === 'created:a') links.push({ href: this.href, target: this.target, rel: this.rel, download: this.download }); }
    remove() {}
    appendChild() {}
  }
  function get(selector) { if (!elements.has(selector)) elements.set(selector, new Element(selector)); return elements.get(selector); }
  const document = { querySelector: get, body: get('body'), activeElement: get('active'), createElement: (tag) => new Element(`created:${tag}`), addEventListener: (name, fn) => listeners.set(name, fn) };
  const setTimeout = (callback, delay) => { const id = ++timerId; timers.set(id, { callback, delay }); return id; };
  const clearTimeout = (id) => timers.delete(id);
  const window = { LogikappsState: core, LOGIKAPPS_CATALOG: [], LOGIKAPPS_DISCOVER: discover, LOGIKAPPS_PACKS: packs, crypto: { randomUUID }, setTimeout, scrollTo() {} };
  if (native) window.webkit = { messageHandlers: { logikapps: { postMessage(request) { requests.push(request); if (request.action === 'getState') window.logikappsReply({ id: request.id, ok: true, result: initial }); } } } };
  const localStorage = { getItem(key) { return storage.get(key) ?? null; }, setItem(key, value) { if (key === failKey) throw new Error('Quota exceeded'); storage.set(key, value); } };
  const context = vm.createContext({ window, document, localStorage, console, Map, Set, Date, JSON, URL, Blob, TextEncoder, setTimeout, clearTimeout, requestAnimationFrame: (fn) => fn(), FormData: class { constructor(form) { this.fields = form.fields; } get(name) { return this.fields[name] ?? null; } } });
  const source = fs.readFileSync(path.join(root, 'web/app.js'), 'utf8');
  const instrumented = source.replace(/\}\)\(\);\s*$/, `window.__test = { bridge, validatedState, mutate, submitApp, submitIdea, appCard, openAppEditor, openIdeaEditor, launch, importFile, importBrowser, handleAction, renderApps, renderIdeas, renderSettings, changeView, filteredApps, filteredIdeas, readDiscoverCatalog, filteredDiscover, renderDiscover, addDiscover, connectDiscover, readPackCatalog, filteredPacks, renderPacks, getView: () => view, load, getState: () => state, getPendingImport: () => pendingImport, setQuery: (value) => { query = value; }, setView: (value) => { view = value; }, setCategory: (value) => { category = value; } }; })();`);
  vm.runInContext(instrumented, context, { filename: 'app.js' });
  return { api: window.__test, window, storage, timers, requests, links, elements, listeners, get, failStorage(key) { failKey = key; } };
}

const plain = (value) => JSON.parse(JSON.stringify(value));
const form = (fields, id = '') => ({ dataset: { id }, fields });

test('public package starts empty and uses neutral profile with local scripts only', () => {
  const index = fs.readFileSync(path.join(root, 'web/index.html'), 'utf8');
  assert.match(index, /Mi espacio/);
  assert.doesNotMatch(index, /NANOOK|https?:\/\//);
  assert.match(index, /src="state.js"/);
  const sandbox = { window: {} };
  vm.runInNewContext(fs.readFileSync(path.join(root, 'web/catalog.js'), 'utf8'), sandbox);
  assert.deepEqual(plain(sandbox.window.LOGIKAPPS_CATALOG), []);
  const h = harness();
  assert.equal(h.api.getState().apps.length, 0);
  assert.equal(h.api.getView(), 'discover');
  h.api.changeView('apps');
  const html = h.get('#main-content').innerHTML;
  for (const value of ['.app', '.command', 'Carpeta', 'Enlace web', 'Explorar herramientas', 'Agregar una app propia', 'Guardar una idea']) assert.ok(html.includes(value), value);
});

test('validates allowed schema and discards unknown/imported environment data', () => {
  const checked = core.validatedState({ ...library([app({ extra: '<script>' })]), settings: { tracking: 'ignored' }, environment: { native: true, dataPath: '/someone/private' }, arbitrary: true });
  assert.equal(checked.apps[0].extra, undefined);
  assert.deepEqual(checked.settings, {});
  assert.deepEqual(checked.environment, { native: false });
  assert.deepEqual(core.validatedState({ ...blank(), environment: { version: '0.2.0', dataPath: '/tmp/test' } }, true).environment, { native: true, version: '0.2.0', dataPath: '/tmp/test' });
});

test('rejects malformed structures, field types, inherited enum names, and bad links', () => {
  const bad = [null, [], {}, { ...blank(), schemaVersion: '1' }, { ...blank(), apps: {} }, { ...blank(), settings: [] }, { ...blank(), environment: 'native' }, library([null]), library([[]]), library([app({ favorite: 'false' })]), library([app({ notes: 0 })]), library([app({ sourcePath: false })]), library([app({ lastOpenedAt: [] })]), library([app({ description: null })]), library([app({ id: '\0' })]), library([app({ category: '__proto__' })]), library([app({ status: 'constructor' })]), library([app({ kind: 'shell' })]), library([], [idea({ status: 'toString' })]), library([], [idea({ appId: 3 })]), library([], [idea({ updatedAt: {} })]), library([], [idea({ appId: 'missing' })])];
  for (const input of bad) assert.throws(() => core.validatedState(input));
});

test('enforces text lengths, duplicate IDs after trimming, and app/idea limits', () => {
  assert.throws(() => core.validatedState(library([app({ name: 'a'.repeat(101) })])));
  assert.throws(() => core.validatedState(library([], [idea({ description: 'a'.repeat(16001) })])));
  assert.throws(() => core.validatedState(library([app(), app({ id: ' one ' })])));
  assert.throws(() => core.validatedState(library([], [idea(), idea()])));
  assert.equal(core.validatedState(library(Array.from({ length: 250 }, (_, n) => app({ id: `${n}` })))).apps.length, 250);
  assert.throws(() => core.validatedState(library(Array.from({ length: 251 }, (_, n) => app({ id: `${n}` })))));
  assert.equal(core.validatedState(library([], Array.from({ length: 2000 }, (_, n) => idea({ id: `${n}` })))).ideas.length, 2000);
  assert.throws(() => core.validatedState(library([], Array.from({ length: 2001 }, (_, n) => idea({ id: `${n}` })))));
});

test('accepts only full HTTP(S) URLs without credentials', () => {
  for (const target of ['javascript:alert(1)', 'data:text/html,x', 'file:///tmp/app.app', 'mailto:a@example.com', 'ftp://example.com', 'https:example.com', 'https://a:b@example.com', 'https://example.com@evil.example', '//example.com', '']) {
    assert.equal(core.validURL(target), null, target);
    assert.throws(() => core.validatedState(library([app({ target })])));
  }
  for (const target of ['https://example.com/a?x=1&y=2', 'http://localhost:1234', 'https://ejemplo.cl/ruta']) assert.ok(core.validURL(target));
});

test('rejects URL normalization tricks consistently with native validation', () => {
  for (const target of ['https://example.com\\path', 'https://exa\tmple.com', 'https://example.com/a b', 'https://example.com/\npath', 'https://example.com/\rpath', 'https://example.com/\u0085path', 'https://example.com/\u200bpath', 'https://example.com/\u00a0path', 'https://@example.com', 'https://:password@example.com']) {
    assert.equal(core.validURL(target), null, target);
    assert.throws(() => core.validatedState(library([app({ target })])));
  }
  assert.equal(core.validURL(' https://example.com'), null);
  assert.equal(core.validURL('https://example.com '), null);
  assert.ok(core.validURL('https://example.com/a%20b'));
});

test('emoji data roundtrips with the same UTF-16 field limits as native', () => {
  const input = library([app({ name: '🎵'.repeat(50) })], [idea({ title: '💡'.repeat(80), description: '🚀'.repeat(8000) })]);
  const restored = core.parseImport(core.serialize(core.validatedState(input)));
  assert.equal(restored.apps[0].name, input.apps[0].name);
  assert.equal(restored.ideas[0].title, input.ideas[0].title);
  assert.equal(restored.ideas[0].description, input.ideas[0].description);
  assert.throws(() => core.validatedState(library([app({ name: '🎵'.repeat(51) })])));
  assert.throws(() => core.validatedState(library([], [idea({ title: '💡'.repeat(81) })])));
  assert.throws(() => core.validatedState(library([], [idea({ description: '🚀'.repeat(8001) })])));
});

test('preserves quoted Mac paths without shell interpretation and checks access types', () => {
  const target = '/Users/otra persona/Música & videos/La "app" de O\'Neil.app';
  assert.equal(core.validatedState(library([app({ kind: 'app', target })])).apps[0].target, target);
  assert.doesNotThrow(() => core.validatedState(library([app({ kind: 'command', target: '/tmp/$(literal).command' })])));
  for (const change of [{ kind: 'app', target: '/tmp/plain.txt' }, { kind: 'command', target: '/tmp/a.sh' }, { kind: 'folder', target: 'relative/path' }, { kind: 'folder', target: '/tmp/a\nb' }, { kind: 'folder', target: '/tmp/a\rb' }, { sourcePath: '/tmp/a\0b' }]) assert.throws(() => core.validatedState(library([app(change)])));
  assert.doesNotThrow(() => core.validatedState(library([app({ kind: 'managed', target: 'trackhunt', sourcePath: '/tmp/legacy' })])));
  assert.throws(() => core.validatedState(library([app({ kind: 'managed', target: 'other' })])));
});

test('8 MB limit measures actual UTF-8 bytes even if file metadata is inaccurate', async () => {
  const text = JSON.stringify({ ...blank(), unexpected: 'é'.repeat(4_000_000) });
  assert.throws(() => core.parseImport(text), /8 MB/);
  assert.throws(() => core.serialize({ value: 'é'.repeat(4_000_000) }), /8 MB/);
  const h = harness();
  await assert.rejects(h.api.importFile({ size: 1, text: async () => text }), /8 MB/);
  assert.equal(h.api.getPendingImport(), null);
});

test('browser CRUD persists edits, favorites, idea linkage, deletions, and restart', async () => {
  const h = harness();
  await h.api.mutate('saveApp', { app: app() });
  await h.api.mutate('saveIdea', { idea: idea({ appId: 'one' }) });
  await h.api.mutate('toggleFavorite', { id: 'one' });
  assert.equal(h.api.getState().apps[0].favorite, true);
  await h.api.mutate('saveApp', { app: app({ name: 'Nueva versión', favorite: true }) });
  assert.equal(h.api.getState().apps.length, 1);
  assert.equal(h.api.getState().apps[0].name, 'Nueva versión');
  const resumed = harness({ stored: { [storageKey]: h.storage.get(storageKey) } });
  assert.equal(resumed.api.getState().apps[0].favorite, true);
  assert.equal(resumed.api.getState().ideas[0].appId, 'one');
  await h.api.mutate('deleteApp', { id: 'one' });
  assert.equal(h.api.getState().ideas.length, 1);
  assert.equal(h.api.getState().ideas[0].appId, '');
  await h.api.mutate('deleteIdea', { id: 'idea' });
  assert.equal(h.api.getState().ideas.length, 0);
});

test('editor submit creates and updates records and clears stale folder paths', async () => {
  const h = harness();
  const fields = { name: 'Mi carpeta', description: 'Descripción', category: 'personal', kind: 'folder', target: '/tmp/Mis ideas', status: 'ready', icon: 'folder', notes: '', favorite: 'on' };
  await h.api.submitApp(form(fields));
  const created = h.api.getState().apps[0];
  assert.equal(created.sourcePath, fields.target);
  await h.api.submitApp(form({ ...fields, kind: 'url', target: 'https://example.com', name: 'Mi sitio' }, created.id));
  assert.equal(h.api.getState().apps[0].sourcePath, undefined);
  await h.api.submitIdea(form({ title: 'Plan', description: 'Idea', status: 'development', appId: created.id }));
  const savedIdea = h.api.getState().ideas[0];
  await h.api.submitIdea(form({ title: 'Plan editado', description: 'Más datos', status: 'ready', appId: created.id }, savedIdea.id));
  assert.equal(h.api.getState().ideas[0].createdAt, savedIdea.createdAt);
  assert.equal(h.api.getState().ideas[0].title, 'Plan editado');
  await assert.rejects(h.api.submitApp(form({ ...fields, name: '  ' })), /nombre/);
  await assert.rejects(h.api.submitApp(form({ ...fields, kind: 'url', target: 'javascript:alert(1)' })), /enlace/);
  await assert.rejects(h.api.submitApp(form({ ...fields, kind: 'app', target: 'relative.app' })), /ruta completa/);
  await assert.rejects(h.api.submitIdea(form({ title: ' ', description: '', status: 'idea' })), /nombre/);
});

test('search matches accents, notes, all terms, ideas, collection, and favorites', async () => {
  const h = harness();
  await h.api.mutate('saveApp', { app: app({ notes: 'Trabajo rápido', favorite: true }) });
  await h.api.mutate('saveApp', { app: app({ id: 'two', name: 'Negocio', category: 'business', description: '', notes: '' }) });
  await h.api.mutate('saveIdea', { idea: idea({ title: 'Música nueva', description: 'Plan rápido' }) });
  h.api.setQuery('MUSICA rapido');
  assert.deepEqual(plain(h.api.filteredApps().map((a) => a.id)), ['one']);
  assert.equal(h.api.filteredIdeas().length, 1);
  h.api.setQuery(''); h.api.setCategory('business');
  assert.deepEqual(plain(h.api.filteredApps().map((a) => a.id)), ['two']);
  h.api.setCategory('all'); h.api.setView('favorites');
  assert.deepEqual(plain(h.api.filteredApps().map((a) => a.id)), ['one']);
});

test('app and idea editors/cards escape HTML and attributes including Mac paths', async () => {
  const h = harness();
  const tricky = app({ id: '" onclick="x', name: '<img src=x onerror=1>', kind: 'folder', target: '/tmp/"&<folder>', description: '<script>alert(1)</script>', notes: '"&<note>' });
  await h.api.mutate('saveApp', { app: tricky });
  const card = h.api.appCard(tricky);
  assert.doesNotMatch(card, /<script>|<img src=x/);
  assert.match(card, /&lt;img/);
  assert.match(card, /data-id="&quot; onclick=&quot;x"/);
  h.api.openAppEditor(tricky.id);
  assert.match(h.get('#dialog-content').innerHTML, /value="\/tmp\/&quot;&amp;&lt;folder&gt;"/);
  await h.api.mutate('saveIdea', { idea: idea({ title: '<b>Idea</b>', description: '</textarea><script>x</script>' }) });
  h.api.openIdeaEditor('idea');
  const editor = h.get('#dialog-content').innerHTML;
  assert.doesNotMatch(editor, /<script>/);
  assert.match(editor, /&lt;\/textarea&gt;/);
});

test('folders consistently show a folder action in cards, recents, and linked ideas', async () => {
  const h = harness();
  const folder = app({ kind: 'folder', target: '/tmp/folder', lastOpenedAt: '2026-09-30T12:00:00Z' });
  await h.api.mutate('saveApp', { app: folder });
  await h.api.mutate('saveIdea', { idea: idea({ appId: folder.id }) });
  assert.match(h.api.appCard(folder), /data-action="reveal"/);
  assert.match(h.api.appCard(folder), />Ver carpeta<\/button>/);
  h.api.setView('home'); h.api.renderApps();
  assert.match(h.get('#main-content').innerHTML, /class="recent-app" data-action="reveal"/);
  h.api.renderIdeas();
  assert.match(h.get('#main-content').innerHTML, /idea-linked" data-action="reveal"/);
  assert.match(h.get('#main-content').innerHTML, /Carpeta · /);
});

test('browser launches only web links with opener protection and records recents', async () => {
  const h = harness();
  await h.api.mutate('saveApp', { app: app() });
  await h.api.launch('one');
  assert.deepEqual(h.links[0], { href: 'https://example.com/', target: '_blank', rel: 'noopener noreferrer', download: undefined });
  assert.ok(h.api.getState().apps[0].lastOpenedAt);
  await h.api.mutate('saveApp', { app: app({ id: 'local', kind: 'app', target: '/tmp/Test.app' }) });
  await h.api.launch('local');
  assert.equal(h.links.length, 1);
  assert.equal(h.api.getState().apps[1].lastOpenedAt, undefined);
});

test('corrupt browser storage is preserved and cannot silently seed over it', () => {
  const corrupt = '{broken';
  const h = harness({ stored: { [storageKey]: corrupt } });
  assert.equal(h.storage.get(storageKey), corrupt);
  assert.equal(h.get('#add-app-button').disabled, true);
  assert.match(h.get('#main-content').innerHTML, /no terminó de cargar/);
});

test('malformed imports clear pending confirmation and never alter current data', async () => {
  const h = harness();
  await h.api.mutate('saveApp', { app: app() });
  const before = h.storage.get(storageKey);
  await h.api.importFile({ size: 100, text: async () => JSON.stringify(blank()) });
  assert.ok(h.api.getPendingImport());
  await assert.rejects(h.api.importFile({ size: 4, text: async () => '{bad' }), /leer esta copia/);
  assert.equal(h.api.getPendingImport(), null);
  await h.api.handleAction('confirm-import');
  assert.equal(h.storage.get(storageKey), before);
  assert.equal(h.storage.has(backupKey), false);
});

test('import saves a durable previous copy, replaces only after confirmation, and allows download', async () => {
  const h = harness();
  await h.api.mutate('saveApp', { app: app() });
  const contents = JSON.stringify(library([app({ id: 'imported', name: 'Compartida' })]));
  await h.api.importFile({ size: contents.length, text: async () => contents });
  assert.equal(h.api.getState().apps[0].id, 'one');
  await h.api.handleAction('confirm-import');
  assert.equal(h.api.getState().apps[0].id, 'imported');
  assert.equal(JSON.parse(h.storage.get(backupKey)).apps[0].id, 'one');
  assert.equal(JSON.parse(h.storage.get(backupKey)).environment, undefined);
  h.api.renderSettings();
  assert.match(h.get('#main-content').innerHTML, /Descargar copia anterior/);
  assert.match(h.get('#main-content').innerHTML, /ajustar las rutas/);
  await h.api.handleAction('export-previous');
  assert.match(h.links.at(-1).download, /^LOGIKAPPS-copia-anterior-/);
});

test('exported browser copy can be imported again and excludes local environment', async () => {
  const h = harness();
  await h.api.mutate('saveApp', { app: app({ name: 'Áudio & vídeos', notes: 'Texto \"citado\"' }) });
  await h.api.mutate('saveIdea', { idea: idea({ appId: 'one' }) });
  await h.api.handleAction('export');
  const blob = resolveObjectURL(h.links.at(-1).href);
  const data = await blob.text();
  assert.ok(blob.size <= core.MAX_BYTES);
  assert.equal(JSON.parse(data).environment, undefined);
  assert.deepEqual(plain(core.parseImport(data).apps), plain(h.api.getState().apps));
  assert.deepEqual(plain(core.parseImport(data).ideas), plain(h.api.getState().ideas));
});

test('storage failure during backup or replacement leaves active data untouched', async () => {
  for (const failingKey of [backupKey, storageKey]) {
    const h = harness();
    await h.api.mutate('saveApp', { app: app() });
    const before = h.storage.get(storageKey);
    h.failStorage(failingKey);
    assert.throws(() => h.api.importBrowser(blank()), /espacio/);
    assert.equal(h.storage.get(storageKey), before);
    assert.equal(h.api.getState().apps[0].id, 'one');
  }
});

test('native human dialogs have no premature 30-second timeout; automatic actions do', async () => {
  const h = harness({ native: true });
  await Promise.resolve(); await Promise.resolve();
  for (const action of ['choosePath', 'importData', 'exportData', 'launch']) {
    const pending = h.api.bridge(action);
    const request = h.requests.at(-1);
    assert.equal([...h.timers.values()].some((timer) => timer.delay === 30000), false, action);
    h.window.logikappsReply({ id: request.id, ok: true, result: { cancelled: true } });
    assert.equal((await pending).cancelled, true);
  }
  const waiting = h.api.bridge('saveApp');
  const timer = [...h.timers.values()].find((entry) => entry.delay === 30000);
  assert.ok(timer);
  timer.callback();
  await assert.rejects(waiting, /tardó en responder/);
});


const sharedTool = (overrides = {}) => ({ id: 'shared-web', name: 'Herramienta pública', description: 'Una herramienta para explorar', category: 'creative', icon: 'sparkles', kind: 'web', url: 'https://example.com/tool', requirements: 'Navegador e internet', ...overrides });

test('empty first launch opens Explore while existing libraries preserve My apps and content', async () => {
  const discover = [sharedTool()];
  const fresh = harness({ discover });
  assert.equal(fresh.api.getView(), 'discover');
  assert.match(fresh.get('#main-content').innerHTML, /Descubre lo que puedes usar/);
  assert.match(fresh.get('#main-content').innerHTML, /Herramienta pública/);
  assert.match(fresh.get('#main-content').innerHTML, /Mis apps es tu biblioteca personal/);
  assert.equal(JSON.parse(fresh.storage.get(storageKey)).apps.length, 0);
  const personal = library([app({ target: 'https://personal.example' })], [idea()]);
  const returning = harness({ discover, stored: { [storageKey]: JSON.stringify(personal) } });
  assert.equal(returning.api.getView(), 'apps');
  assert.equal(returning.api.getState().apps[0].target, 'https://personal.example');
  assert.equal(returning.api.getState().ideas.length, 1);
  assert.match(returning.get('#main-content').innerHTML, /Tus herramientas, a un clic/);
  const nativeFresh = harness({ discover, native: true });
  await Promise.resolve(); await Promise.resolve();
  assert.equal(nativeFresh.api.getView(), 'discover');
  assert.equal(nativeFresh.api.getState().apps.length, 0);
});

test('Explore validates public URLs, escapes all content, and ignores private catalog fields', () => {
  const unsafe = ['javascript:alert(1)', 'data:text/html,x', 'file:///Users/private/app.app', 'https://user:secret@example.com', 'https://exa\tmple.com', 'https://example.com\\path'].map((url, index) => sharedTool({ id: `unsafe-${index}`, url }));
  const h = harness({ discover: [sharedTool({ name: '<script>unsafe</script>', description: '<img src=x>', requirements: '</p><script>x</script>', sourcePath: '/Users/private/project', target: '/Users/private/App.app', favorite: true }), ...unsafe] });
  assert.equal(h.api.filteredDiscover().length, 1);
  const html = h.get('#main-content').innerHTML;
  assert.doesNotMatch(html, /<script>|<img src=x>|javascript:|file:\/\/|\/Users\/private/);
  assert.match(html, /&lt;script&gt;unsafe&lt;\/script&gt;/);
  assert.match(html, /href="https:\/\/example.com\/tool" target="_blank" rel="noopener noreferrer"/);
  assert.equal(h.api.getState().apps.length, 0);
  assert.equal(h.api.filteredDiscover()[0].sourcePath, undefined);
  assert.equal(h.api.filteredDiscover()[0].target, undefined);
  assert.equal(h.api.filteredDiscover()[0].favorite, undefined);
});

test('Explore search filters accents, requirements, category, and every search term', () => {
  const h = harness({ discover: [sharedTool({ name: 'Música en línea', category: 'music', requirements: 'Cuenta gratuita' }), sharedTool({ id: 'download', name: 'Editor', category: 'creative', kind: 'download', url: 'https://example.com/download' })] });
  h.api.setQuery('MUSICA gratuita');
  assert.deepEqual(plain(h.api.filteredDiscover().map((entry) => entry.id)), ['shared-web']);
  h.api.setQuery(''); h.api.setCategory('creative');
  assert.deepEqual(plain(h.api.filteredDiscover().map((entry) => entry.id)), ['download']);
  h.api.setQuery('no coincide'); h.api.renderDiscover();
  assert.match(h.get('#main-content').innerHTML, /No encontramos coincidencias/);
});

test('adding a shared web tool uses a new personal ID, ignores private fields, and deduplicates URLs', async () => {
  const h = harness({ discover: [sharedTool({ url: 'https://example.com:443/tool', sourcePath: '/Users/private', kind: 'web' })] });
  await Promise.all([h.api.addDiscover('shared-web'), h.api.addDiscover('shared-web')]);
  assert.equal(h.api.getState().apps.length, 1);
  const saved = h.api.getState().apps[0];
  assert.notEqual(saved.id, 'shared-web');
  assert.equal(saved.target, 'https://example.com/tool');
  assert.equal(saved.kind, 'url');
  assert.equal(saved.status, 'ready');
  assert.equal(saved.sourcePath, undefined);
  assert.equal(saved.favorite, false);
  await h.api.addDiscover('shared-web');
  assert.equal(h.api.getState().apps.length, 1);
  assert.match(h.get('#main-content').innerHTML, /Ya está en Mis apps/);
  const existing = harness({ discover: [sharedTool({ url: 'https://example.com:443/tool' })], stored: { [storageKey]: JSON.stringify(library([app({ target: 'https://example.com/tool' })])) } });
  await existing.api.addDiscover('shared-web');
  assert.equal(existing.api.getState().apps.length, 1);
  await assert.rejects(h.api.addDiscover('missing'), /ya no está disponible/);
});

test('download cards connect the correct local type only after the person chooses a path', () => {
  for (const [connectKind, label] of [['app', 'Conectar app'], ['command', 'Conectar lanzador'], ['folder', 'Conectar carpeta']]) {
    const h = harness({ discover: [sharedTool({ kind: 'download', connectKind, url: 'https://example.com/download', description: 'Archivo compartido' })] });
    const html = h.get('#main-content').innerHTML;
    assert.match(html, /Ver descarga/);
    assert.ok(html.includes(label));
    h.api.connectDiscover('shared-web');
    const editor = h.get('#dialog-content').innerHTML;
    assert.match(editor, /value="Herramienta pública"/);
    assert.match(editor, /Archivo compartido/);
    assert.ok(editor.includes(`<option value="${connectKind}" selected>`));
    assert.match(editor, /id="app-target" value=""/);
    assert.equal(h.api.getState().apps.length, 0);
    assert.equal(h.links.length, 0);
  }
  const defaultApp = harness({ discover: [sharedTool({ kind: 'download' })] });
  defaultApp.api.connectDiscover('shared-web');
  assert.match(defaultApp.get('#dialog-content').innerHTML, /value="app" selected/);
});

test('import and export keep the shared catalog separate from personal state', async () => {
  const h = harness({ discover: [sharedTool()] });
  h.api.changeView('ideas');
  h.api.importBrowser(library([app({ id: 'personal-only' })]));
  assert.equal(h.api.getView(), 'ideas');
  assert.deepEqual(plain(h.api.getState().apps.map((entry) => entry.id)), ['personal-only']);
  assert.equal(h.api.filteredDiscover().length, 1);
  await h.api.handleAction('export');
  const exported = JSON.parse(await resolveObjectURL(h.links.at(-1).href).text());
  assert.equal(exported.discover, undefined);
  assert.deepEqual(exported.apps.map((entry) => entry.id), ['personal-only']);
});

test('missing or wholly invalid shared catalog has a safe public guide fallback', () => {
  for (const discover of [undefined, [], {}, [sharedTool({ url: 'javascript:alert(1)' })], [sharedTool({ connectKind: 'shell' })]]) {
    const h = harness({ discover });
    assert.equal(h.api.getView(), 'discover');
    assert.match(h.get('#main-content').innerHTML, /Ver guía de LOGIKAPPS/);
    assert.match(h.get('#main-content').innerHTML, /href="https:\/\/github.com\/pablohidalgochile-source\/LOGIKAPPS#readme" target="_blank" rel="noopener noreferrer"/);
    assert.equal(h.api.getState().apps.length, 0);
  }
});


test('a pending native catalog save cannot create duplicate apps from a second click', async () => {
  const h = harness({ native: true, discover: [sharedTool()] });
  await Promise.resolve(); await Promise.resolve();
  const first = h.api.addDiscover('shared-web');
  const second = h.api.addDiscover('shared-web');
  const saves = h.requests.filter((request) => request.action === 'saveApp');
  assert.equal(saves.length, 1);
  h.window.logikappsReply({ id: saves[0].id, ok: true, result: library([saves[0].payload.app]) });
  await Promise.all([first, second]);
  assert.equal(h.api.getState().apps.length, 1);
  assert.match(h.get('#main-content').innerHTML, /Ya está en Mis apps/);
});


const sharedPack = (overrides = {}) => ({ id: 'dj', name: 'Pack DJ', description: 'Herramientas para tu sesión', category: 'music', icon: 'disc', version: '0.1 beta', url: 'https://example.com/pack.zip', requirements: 'Mac y guía', steps: ['Descarga', 'Prepara', 'Conecta'], tools: [sharedTool({ id: 'pack-web' }), sharedTool({ id: 'pack-local', name: 'VJ/LAB', kind: 'download', connectKind: 'command', url: 'https://example.com/pack.zip' })], ...overrides });

test('packs are the first screen for empty libraries and never populate or export personal state', async () => {
  const h = harness({ packs: [sharedPack()] });
  assert.equal(h.api.getView(), 'packs');
  assert.match(h.get('#main-content').innerHTML, /Pack DJ/);
  assert.match(h.get('#main-content').innerHTML, /2 herramientas/);
  assert.equal(h.api.getState().apps.length, 0);
  await h.api.handleAction('view-pack', 'dj');
  assert.match(h.get('#main-content').innerHTML, /Empieza aquí/);
  assert.match(h.get('#main-content').innerHTML, /Conectar lanzador/);
  assert.equal(h.api.getState().apps.length, 0);
  await h.api.handleAction('export');
  const exported = JSON.parse(await resolveObjectURL(h.links.at(-1).href).text());
  assert.equal(exported.packs, undefined);
  assert.deepEqual(exported.apps, []);
  const existing = harness({ packs: [sharedPack()], stored: { [storageKey]: JSON.stringify(library([app()], [idea()])) } });
  assert.equal(existing.api.getView(), 'apps');
  existing.api.changeView('packs');
  assert.equal(existing.api.getState().apps.length, 1);
  assert.equal(existing.api.getState().ideas.length, 1);
});

test('pack content can add web access without duplicates and connect local tools without copying paths', async () => {
  const h = harness({ packs: [sharedPack()] });
  await h.api.handleAction('view-pack', 'dj');
  await h.api.addDiscover('pack-web');
  await h.api.addDiscover('pack-web');
  assert.equal(h.api.getState().apps.length, 1);
  assert.equal(h.api.getState().apps[0].target, 'https://example.com/tool');
  assert.match(h.get('#main-content').innerHTML, /Ya está en Mis apps/);
  h.api.connectDiscover('pack-local');
  assert.match(h.get('#dialog-content').innerHTML, /value="VJ\/LAB"/);
  assert.match(h.get('#dialog-content').innerHTML, /value="command" selected/);
  assert.match(h.get('#dialog-content').innerHTML, /id="app-target" value=""/);
  assert.equal(h.links.length, 0);
  await assert.rejects(h.api.handleAction('view-pack', 'absent'), /ya no está disponible/);
});

test('pack search matches contained apps and moving back clears detail selection', async () => {
  const h = harness({ packs: [sharedPack(), sharedPack({ id: 'fraternity', name: 'Fraternidad', category: 'business', tools: [sharedTool({ name: 'ERP' })] })] });
  h.api.setQuery('vj');
  assert.deepEqual(plain(h.api.filteredPacks().map(p => p.id)), ['dj']);
  h.api.setQuery(''); h.api.setCategory('business');
  assert.deepEqual(plain(h.api.filteredPacks().map(p => p.id)), ['fraternity']);
  await h.api.handleAction('view-pack', 'dj');
  h.api.changeView('packs');
  assert.match(h.get('#main-content').innerHTML, /Un pack. Todo para empezar/);
  assert.doesNotMatch(h.get('#main-content').innerHTML, /Dentro de este pack/);
});

test('packs reject unsafe or incomplete manifests and render supplied text safely', () => {
  for (const change of [{ url: 'file:///private' }, { url: 'https://user:password@example.com' }, { tools: [] }, { tools: [sharedTool({ url: 'javascript:alert(1)' })] }, { steps: null }, { steps: ['x'.repeat(1001)] }, { category: '__proto__' }, { version: undefined }]) {
    const h = harness({ packs: [sharedPack(change)] });
    assert.equal(h.api.filteredPacks().length, 0);
    assert.equal(h.api.getView(), 'discover');
  }
  const h = harness({ packs: [sharedPack({ name: '<script>Pack</script>', sourcePath: '/Users/private', steps: ['<img src=x>'] })] });
  assert.match(h.get('#main-content').innerHTML, /&lt;script&gt;Pack/);
  assert.doesNotMatch(h.get('#main-content').innerHTML, /<script>|\/Users\/private/);
  assert.equal(h.api.filteredPacks()[0].sourcePath, undefined);
  assert.equal(h.api.readPackCatalog([sharedPack(), sharedPack()]).length, 1);
});
