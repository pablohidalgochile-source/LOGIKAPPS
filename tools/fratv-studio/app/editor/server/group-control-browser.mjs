/* Prueba el dock agrupado y las cuatro fuentes con estado y puerto temporales. */
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createReadStream } from 'node:fs';
import { mkdtemp, stat, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, extname, sep } from 'node:path';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

const root = resolve(process.argv[2] || resolve(import.meta.dirname, '../..'));
const require = createRequire(join(root, 'scripts/package.json'));
const puppeteer = require('puppeteer-core');
const { CHROME } = await import(pathToFileURL(join(root, 'scripts/chrome.mjs')));
const { createStudioApi } = await import(pathToFileURL(join(root, 'editor/server/server.mjs')));
const dir = await mkdtemp(join(tmpdir(), 'fratv-dock-grupo-'));
const api = createStudioApi({ root, storageDir: dir });
const types = { '.js': 'text/javascript', '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml' };
const posts = [];
const server = createServer((req, res) => {
  if (req.method === 'POST' && req.url.startsWith('/api/live/')) posts.push(req.url);
  api.middleware(req, res, async () => {
    try {
      const path = new URL(req.url, 'http://localhost').pathname;
      if (!path.startsWith('/media/')) throw Error();
      const file = resolve(root, 'handoff', decodeURIComponent(path.slice(7)));
      if (!file.startsWith(join(root, 'handoff') + sep) || !(await stat(file)).isFile()) throw Error();
      res.writeHead(200, { 'Content-Type': types[extname(file)] || 'application/octet-stream' });
      createReadStream(file).pipe(res);
    } catch { res.writeHead(404).end(); }
  });
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--disable-background-timer-throttling', '--disable-renderer-backgrounding'] });
const dock = await browser.newPage();
await dock.setViewport({ width: 400, height: 550 });
const errors = [];
const sources = [];
dock.on('pageerror', error => errors.push(error.message));
const clocks = [
  { channel: 'fraternidad-obs-inicio', resource: 'fraternidad-start', label: 'Inicio', mode: 'countdown' },
  { channel: 'fraternidad-obs-cuenta', resource: 'fraternidad-countdown', label: 'Cuenta regresiva', mode: 'countdown' },
  { channel: 'fraternidad-obs-envivo', resource: 'fraternidad-live', label: 'En vivo', mode: 'elapsed' },
  { channel: 'fraternidad-obs-pausa', resource: 'fraternidad-break', label: 'Pausa', mode: 'countdown' },
];
const read = async channel => (await fetch(`${base}/api/live/${channel}`)).json();
const send = async (channel, body) => (await fetch(`${base}/api/live/${channel}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })).json();
const stable = ({ serverTime, ...state }) => state;
const ready = () => dock.waitForFunction(() => !document.querySelector('[data-action="start"]').disabled);
const select = async channel => { await dock.select('#clock-choice', channel); await ready(); };
const action = async name => {
  const response = dock.waitForResponse(response => response.request().method() === 'POST' && response.url().includes('/api/live/'));
  await dock.click(`[data-action="${name}"]`);
  assert.equal((await response).status(), 200);
  await ready();
};
try {
  await dock.goto(`${base}/live-control?grupo=fraternidad`, { waitUntil: 'domcontentloaded' });
  await ready();
  assert.deepEqual(await dock.$$eval('#clock-choice option', options => options.map(option => option.textContent)), clocks.map(clock => clock.label));
  for (const clock of clocks) {
    await select(clock.channel);
    const state = await read(clock.channel);
    assert.equal(state.mode, clock.mode);
    assert.equal(state.durationMs, 300000);
    assert.equal(state.valueMs, clock.mode === 'elapsed' ? 0 : 300000);
    assert.equal(state.running, false);
    assert.equal(new URL(dock.url()).searchParams.get('channel'), clock.channel);
  }
  assert.equal(posts.length, 0, 'Abrir y seleccionar relojes no debe enviar acciones.');
  console.log('✓ Los cuatro relojes nacen con su modo correcto, sin acciones automáticas.');

  for (const clock of clocks) {
    await select(clock.channel);
    const others = await Promise.all(clocks.filter(item => item !== clock).map(async item => [item.channel, stable(await read(item.channel))]));
    const source = await browser.newPage();
    source.on('pageerror', error => errors.push(error.message));
    await source.setViewport({ width: 1920, height: 1080 });
    await source.bringToFront();
    await source.goto(`${base}/live/${clock.resource}?channel=${clock.channel}&aspecto=16:9`, { waitUntil: 'domcontentloaded' });
    await source.waitForFunction(() => document.documentElement.dataset.liveReady === '1' && document.body.style.visibility === 'visible', { polling: 100 });
    sources.push({ source, clock, loadedAt: Date.now() });
    await dock.bringToFront();
    await dock.$eval('#clock-settings', element => { element.open = true; });
    await dock.$eval('#minutes', element => { element.value = '0.5'; });
    const configured = dock.waitForResponse(response => response.request().method() === 'POST' && response.url().includes('/api/live/'));
    await dock.click('#configure');
    assert.equal((await configured).status(), 200);
    await ready();
    await source.waitForFunction(mode => document.querySelector('[data-field="clock"]').textContent === (mode === 'elapsed' ? '00:00' : '00:30'), { polling: 100 }, clock.mode);
    await action('start');
    assert.equal((await read(clock.channel)).running, true);
    await source.waitForFunction(mode => document.querySelector('[data-field="clock"]').textContent !== (mode === 'elapsed' ? '00:00' : '00:30'), { polling: 100 }, clock.mode);
    await action('pause');
    const paused = await read(clock.channel);
    assert.equal(paused.running, false);
    assert.ok(clock.mode === 'elapsed' ? paused.valueMs > 0 : paused.valueMs < 30000);
    const seconds = clock.mode === 'elapsed' ? Math.floor(paused.valueMs / 1000) : Math.ceil(paused.valueMs / 1000);
    const expected = `00:${String(seconds).padStart(2, '0')}`;
    await source.waitForFunction(value => document.querySelector('[data-field="clock"]').textContent === value, { polling: 100 }, expected);
    assert.equal(await dock.$eval('#clock', element => element.textContent), `00:${expected}`);
    await action('hide');
    await source.waitForFunction(() => document.body.style.visibility === 'hidden', { polling: 100 });
    await action('show');
    await source.waitForFunction(() => document.body.style.visibility === 'visible', { polling: 100 });
    await action('reset');
    const reset = await read(clock.channel);
    assert.equal(reset.valueMs, clock.mode === 'elapsed' ? 0 : 30000);
    assert.equal(reset.running, false);
    for (const [channel, before] of others) assert.deepEqual(stable(await read(channel)), before, `${channel}: otro reloj cambió.`);
    console.log(`✓ ${clock.label}: iniciar, pausar, ocultar, mostrar y reiniciar; fuente real sincronizada y otros canales intactos.`);
  }

  const sleepUntil = async time => { if (time > Date.now()) await new Promise(resolve => setTimeout(resolve, time - Date.now())); };
  async function checkVisible({ source, clock }, phase) {
    const state = await source.evaluate(() => {
      const clock = document.querySelector('[data-field="clock"]');
      let node = clock, visible = true;
      while (node instanceof Element) {
        const style = getComputedStyle(node);
        visible &&= style.visibility === 'visible' && style.display !== 'none' && Number(style.opacity) > 0;
        node = node.parentElement;
      }
      return { visible, text: clock.textContent, ready: document.documentElement.dataset.liveReady };
    });
    assert.equal(state.visible, true, `${clock.label}: desapareció ${phase}.`);
    assert.equal(state.ready, '1');
    assert.equal(state.text, clock.mode === 'elapsed' ? '00:00' : '00:30');
    const path = join(tmpdir(), `${clock.resource}-${phase}.png`);
    await source.screenshot({ path, omitBackground: true });
    const deviation = Number(execFileSync('magick', [path, '-background', 'black', '-alpha', 'remove', '-format', '%[fx:standard_deviation]', 'info:'], { encoding: 'utf8' }));
    assert.ok(deviation > 0.003, `${clock.label}: la captura parece vacía (${deviation}).`);
  }
  await sleepUntil(sources.at(-1).loadedAt + 12000);
  for (const item of sources) await checkVisible(item, '12s');
  console.log('✓ Las cuatro gráficas siguen visibles y dibujadas después de su duración, con el dock en primer plano y sin seek manual.');
  await sleepUntil(sources[0].loadedAt + 65000);
  await checkVisible(sources[0], '65s');
  await sources[0].source.bringToFront();
  await dock.bringToFront();
  await checkVisible(sources[0], 'foco');
  console.log('✓ Inicio sigue dibujado a los 65 segundos y después de cambiar el foco.');
  for (const { source } of sources) await source.close();

  const custom = await send('fraternidad-obs-envivo', { action: 'configure', mode: 'countdown', durationMs: 77000 });
  await send('fraternidad-obs-envivo', { action: 'hide' });
  await select('fraternidad-obs-envivo');
  const beforeReload = stable(await read('fraternidad-obs-envivo'));
  await dock.reload({ waitUntil: 'domcontentloaded' });
  await ready();
  assert.equal(await dock.$eval('#clock-choice', element => element.value), 'fraternidad-obs-envivo');
  assert.equal(await dock.$eval('#mode', element => element.value), custom.mode);
  assert.deepEqual(stable(await read('fraternidad-obs-envivo')), beforeReload);
  console.log('✓ Recargar conserva selección, modo personalizado, duración y visibilidad existentes.');

  let heldRequest;
  let hold = true;
  await dock.setRequestInterception(true);
  dock.on('request', request => {
    if (hold && request.method() === 'GET' && request.url().includes('/api/live/fraternidad-obs-inicio')) { heldRequest = request; hold = false; }
    else request.continue().catch(() => {});
  });
  const beforeSwitch = posts.length;
  await dock.select('#clock-choice', 'fraternidad-obs-inicio');
  await new Promise((resolve, reject) => { const started = Date.now(); const timer = setInterval(() => { if (heldRequest) { clearInterval(timer); resolve(); } else if (Date.now() - started > 5000) { clearInterval(timer); reject(Error('La petición de prueba no comenzó.')); } }, 10); });
  assert.equal(await dock.$eval('[data-action="start"]', element => element.disabled), true);
  await select('fraternidad-obs-envivo');
  await heldRequest.continue().catch(() => {});
  await new Promise(resolve => setTimeout(resolve, 700));
  assert.equal(await dock.$eval('#clock', element => element.textContent), '00:01:17');
  assert.equal(await dock.$eval('#status', element => element.textContent), 'En pausa · Oculto');
  assert.equal(posts.length, beforeSwitch);
  console.log('✓ Un cambio rápido descarta la respuesta anterior y no envía acciones a ningún canal.');

  await send('control-individual', { action: 'configure', mode: 'elapsed', durationMs: 12000 });
  await dock.goto(`${base}/live-control?channel=control-individual`, { waitUntil: 'domcontentloaded' });
  await ready();
  assert.equal(await dock.$eval('#group-control', element => element.hidden), true);
  assert.equal(await dock.$eval('#single-control', element => element.hidden), false);
  await action('start');
  assert.equal((await read('control-individual')).running, true);
  await action('pause');
  console.log('✓ El control individual anterior mantiene su funcionamiento.');
  await dock.goto(`${base}/live-control?grupo=fraternidad&channel=fraternidad-obs-pausa`, { waitUntil: 'domcontentloaded' });
  await ready();
  assert.equal(await dock.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  assert.equal(await dock.$$eval('[data-action]', buttons => buttons.every(button => button.getBoundingClientRect().bottom <= innerHeight)), true, 'Todos los controles de emisión deben quedar visibles en un dock de 400 × 550.');
  const screenshot = join(tmpdir(), 'fraternidad-dock-grupo.png');
  await dock.screenshot({ path: screenshot, fullPage: true });
  assert.deepEqual(errors, []);
  console.log(`✓ Sin errores JavaScript ni desborde horizontal. Captura: ${screenshot}`);
} finally {
  await browser.close();
  await api.close();
  await new Promise(resolve => server.close(resolve));
  await rm(dir, { recursive: true, force: true });
}
