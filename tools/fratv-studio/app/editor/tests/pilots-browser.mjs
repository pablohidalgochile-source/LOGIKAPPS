/* Pilotos Fraternidad: revisión visual y funcional sin aprobar el catálogo.
   Uso: node editor/tests/pilots-browser.mjs [raíz del repositorio] [URL base]
   FRATERNIDAD_QA_OUTPUT cambia la carpeta de capturas y resultado. */
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';
import { execFileSync, spawnSync } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';

const root = resolve(process.argv[2] || resolve(import.meta.dirname, '../..'));
const base = (process.argv[3] || 'http://127.0.0.1:5178').replace(/\/$/, '');
const out = process.env.FRATERNIDAD_QA_OUTPUT || join(tmpdir(), `fraternidad-pilotos-${Date.now()}`);
const require = createRequire(join(root, 'scripts/package.json'));
const puppeteer = require('puppeteer-core');
const { CHROME } = await import(pathToFileURL(join(root, 'scripts/chrome.mjs')).href);
await mkdir(out, { recursive: true });
const browser = await puppeteer.launch({ executablePath: CHROME, headless: true,
  args: ['--force-device-scale-factor=1', '--hide-scrollbars', '--disable-background-timer-throttling', '--disable-renderer-backgrounding'] });
const page = await browser.newPage();
page.setDefaultTimeout(25000);
const errors = [], failedLocal = [], failedExternal = [], checks = [], renders = [], galleries = [];
page.on('pageerror', e => errors.push(e.message));
page.on('requestfailed', req => {
  if (req.failure()?.errorText === 'net::ERR_ABORTED') return;
  const line = `${req.url()}: ${req.failure()?.errorText}`;
  (req.url().startsWith(base) ? failedLocal : failedExternal).push(line);
});
page.on('response', res => { if (res.url().startsWith(base) && res.status() >= 400 && !res.url().endsWith('/favicon.ico')) failedLocal.push(`${res.status()} ${res.url()}`); });
const pass = message => { checks.push(message); console.log(`✓ ${message}`); };

async function waitReady() {
  await page.waitForFunction(() => Boolean(window.PILOT), { polling: 100 });
  await page.evaluate(async () => {
    await window.PILOT.ready;
    await document.fonts.ready;
    await Promise.all([...document.images].map(async img => { if (img.getAttribute('src')) await img.decode(); }));
  });
}
async function frameState() {
  await page.evaluate(() => { window.PILOT.pause(); window.PILOT.seek(1600); });
  await delay(120);
}
function difference(a, b, prefix) {
  const flatA = `${prefix}-a.png`, flatB = `${prefix}-b.png`;
  execFileSync('magick', [a, '-background', 'black', '-alpha', 'remove', '-alpha', 'off', flatA]);
  execFileSync('magick', [b, '-background', 'black', '-alpha', 'remove', '-alpha', 'off', flatB]);
  // ImageMagick escribe AE en stderr tanto con salida 0 (idéntico) como 1.
  // En ImageMagick HDRI el primer valor usa unidades Quantum; el paréntesis
  // contiene píxeles. Control local: diferencia total de10×10 informa6.5535e6(100).
  const result = spawnSync('compare', ['-fuzz', '40%', '-metric', 'AE', flatA, flatB, 'null:'], { encoding: 'utf8' });
  assert(!result.error && [0, 1].includes(result.status), `Falló ImageMagick: ${result.error || result.stderr}`);
  const output = result.stderr.trim();
  const metric = output.match(/\(([\d.e+-]+)\)/i) || output.match(/^([\d.e+-]+)(?:\s|$)/i);
  const amount = metric ? Number(metric[1]) : NaN;
  assert(Number.isFinite(amount) && amount >= 0, `No se pudo leer AE absoluto: ${output}`);
  return amount;
}
function measureLayout() {
  const visible = el => { const r = el.getBoundingClientRect(), s = getComputedStyle(el); return r.width > 0 && r.height > 0 && s.display !== 'none' && s.visibility !== 'hidden'; };
  const style = getComputedStyle(document.documentElement);
  const token = name => {
    const raw = style.getPropertyValue(`--safe-${name}`).trim();
    if (!/^\d+(?:\.\d+)?%$/.test(raw)) throw new Error(`Área segura no expresada en porcentaje: ${name}=${raw}`);
    return parseFloat(raw) / 100;
  };
  const rect = el => { const r = el.getBoundingClientRect(); return { name: el.getAttribute('data-check-bounds') || el.getAttribute('data-field') || el.className, x: r.x, y: r.y, right: r.right, bottom: r.bottom, width: r.width, height: r.height }; };
  const safe = { x: innerWidth * token('x'), top: innerHeight * token('top'), bottom: innerHeight * (1 - token('bottom')), lower: innerHeight * (1 - token('lower')), flag: innerHeight * token('flag') };
  safe.right = innerWidth - safe.x;
  return {
    viewport: [innerWidth, innerHeight], safe,
    bounds: [...document.querySelectorAll('[data-check-bounds]')].filter(visible).map(rect),
    content: [...document.querySelectorAll('[data-field],[data-clock],.intro-kicker,.clock-caption,.intro-footer span')].filter(visible).map(rect),
    text: [...document.querySelectorAll('[data-field],[data-clock]')].filter(visible).filter(el => el.textContent.trim()).map(el => {
      const range = document.createRange(); range.selectNodeContents(el); const ink = range.getBoundingClientRect();
      return { field: el.getAttribute('data-field') || 'reloj', width: el.clientWidth, scrollWidth: el.scrollWidth, height: el.clientHeight, scrollHeight: el.scrollHeight, overflowY: getComputedStyle(el).overflowY, ink: { x: ink.x, y: ink.y, right: ink.right, bottom: ink.bottom } };
    }),
    logos: [...document.images].filter(img => /fraternidad-(horizontal-blanco|insignia)\.png/.test(img.src)).map(img => ({ src: img.src, loaded: img.complete && img.naturalWidth > 0 })),
  };
}
function validateLayout(measurements, piece, aspect) {
  const label = `${piece} ${aspect}`, safe = measurements.safe;
  assert(measurements.bounds.length > 0, `${label}: faltan marcadores data-check-bounds.`);
  const inside = box => box.x >= safe.x - 1 && box.y >= safe.top - 1 && box.right <= safe.right + 1 && box.bottom <= safe.bottom + 1;
  for (const box of [...measurements.bounds, ...measurements.content]) assert(inside(box), `${label}: contenido fuera del área segura ${JSON.stringify({ box, safe })}`);
  if (piece === 'mosca') assert(measurements.bounds[0].y >= safe.flag - 1, `${label}: la mosca invade la interfaz superior.`);
  if (piece === 'nombre') assert(measurements.bounds[0].bottom <= safe.lower + 1, `${label}: la placa invade la interfaz inferior.`);
  // Las métricas de la fuente pueden exceder la caja de línea sin recorte cuando overflow es visible.
  for (const block of measurements.text) {
    const clippedHeight = ['hidden', 'clip'].includes(block.overflowY) && block.scrollHeight > block.height + 1;
    assert(block.scrollWidth <= block.width + 1 && !clippedHeight, `${label}: texto recortado ${JSON.stringify(block)}`);
    assert(inside(block.ink), `${label}: texto fuera del área segura ${JSON.stringify(block)}`);
  }
  assert(measurements.logos.length > 0, `${label}: no se encontró un logo original de Fraternidad.`);
  assert(measurements.logos.every(img => img.loaded), `${label}: logo sin cargar.`);
}
async function readClock() {
  return page.$eval('[data-clock]', el => el.textContent.trim());
}
function clockSeconds(text) {
  const numbers = text.match(/\d+/g)?.map(Number) || [];
  assert(numbers.length >= 2 && numbers.length <= 3, `Lectura de reloj desconocida: ${text}`);
  return numbers.reduce((sum, value) => sum * 60 + value, 0);
}
async function galleryClocks() {
  return page.$$eval('iframe[data-piece="inicio"]', frames => frames.map(frame => frame.contentDocument.querySelector('[data-clock]').textContent.trim()));
}
async function testGallery(width, height) {
  await page.setViewport({ width, height, deviceScaleFactor: 1 });
  await page.goto(`${base}/pilotos-fraternidad/`, { waitUntil: 'networkidle2' });
  await page.waitForFunction(() => document.querySelectorAll('.viewport.loaded iframe').length === 6);
  await delay(200);
  const layout = await page.evaluate(() => ({
    width: innerWidth, scrollWidth: document.documentElement.scrollWidth,
    frames: [...document.querySelectorAll('iframe[data-piece]')].map(frame => {
      const r = frame.getBoundingClientRect(), v = frame.parentElement.getBoundingClientRect();
      return { piece: frame.dataset.piece, aspect: frame.dataset.aspect, native: [frame.contentWindow.innerWidth, frame.contentWindow.innerHeight], displayed: [r.width, r.height], viewport: [v.width, v.height], left: r.left, right: r.right, title: frame.title };
    }),
  }));
  assert(layout.scrollWidth <= width + 1, `Galería ${width}: desborde horizontal (${layout.scrollWidth}).`);
  assert.equal(layout.frames.length, 6, 'La galería no muestra seis vistas.');
  assert.equal(new Set(layout.frames.map(frame => `${frame.piece}/${frame.aspect}`)).size, 6);
  for (const frame of layout.frames) {
    assert.deepEqual(frame.native, frame.aspect === '16:9' ? [1920, 1080] : [1080, 1920], 'La galería cambió el lienzo nativo.');
    assert(frame.title && frame.left >= -1 && frame.right <= width + 1, `Iframe fuera de pantalla o sin título: ${JSON.stringify(frame)}`);
    assert(frame.displayed.every((dimension, i) => Math.abs(dimension - frame.viewport[i]) < 2), `Iframe no ajustado a su marco: ${JSON.stringify(frame)}`);
  }
  const values = { name: 'MARÍA JOSÉ GONZÁLEZ', role: 'COORDINADORA DE COMUNIDAD', title: 'CONVERSACIONES\nFRATERNIDAD', subtitle: 'Encuentro de la comunidad' };
  for (const [key, value] of Object.entries(values)) {
    await page.$eval(`#sample-${key}`, el => { el.value = ''; });
    await page.type(`#sample-${key}`, value);
  }
  const edited = await page.$$eval('iframe[data-piece]', frames => frames.flatMap(frame => [...frame.contentDocument.querySelectorAll('[data-field]')].map(el => ({ piece: frame.dataset.piece, aspect: frame.dataset.aspect, key: el.dataset.field, text: el.textContent }))));
  assert.equal(edited.length, 8, 'No aparecen todos los campos editables en ambos formatos.');
  for (const field of edited) assert.equal(field.text, values[field.key], `El control ${field.key} no actualiza ${field.piece} ${field.aspect}.`);
  for (const frame of page.frames().filter(frame => frame.url().includes('/resource.html'))) {
    const [piece, aspect] = await frame.evaluate(() => [document.documentElement.dataset.piece, document.documentElement.dataset.aspecto]);
    validateLayout(await frame.evaluate(measureLayout), piece, aspect);
  }
  for (const background of ['ivory', 'black', 'checker', 'scene']) {
    await page.select('#background', background);
    assert((await page.$$eval('iframe[data-piece]', frames => frames.map(frame => frame.contentDocument.body.dataset.background))).every(value => value === background), `Galería ${width}: fondo ${background} no aplicado a todas las vistas.`);
  }
  await page.click('.switch-label');
  assert((await page.$$eval('iframe[data-piece]', frames => frames.map(frame => frame.contentDocument.querySelector('.review-safe').hidden))).every(hidden => !hidden), 'El control de áreas seguras no activa las seis vistas.');
  await page.click('.switch-label');
  assert((await page.$$eval('iframe[data-piece]', frames => frames.map(frame => frame.contentDocument.querySelector('.review-safe').hidden))).every(Boolean), 'El control de áreas seguras no oculta las seis vistas.');
  await page.select('#duration', '60');
  assert.deepEqual((await galleryClocks()).map(clockSeconds), [60, 60]);
  await page.click('#clock-start');
  await delay(1500);
  const running = (await galleryClocks()).map(clockSeconds);
  assert(running.every(value => value >= 57 && value < 60) && Math.abs(running[0] - running[1]) <= 1, `Los relojes de la galería no avanzan juntos: ${running}`);
  await page.click('#clock-pause');
  await delay(150);
  const paused = await galleryClocks();
  await delay(1100);
  assert.deepEqual(await galleryClocks(), paused, 'La pausa de galería no conserva ambos relojes.');
  assert((await page.$eval('#clock-status', el => el.textContent)).includes('Reloj en pausa'));
  await page.click('#clock-start');
  await delay(1100);
  assert((await galleryClocks()).map(clockSeconds).every((value, i) => value < clockSeconds(paused[i])), 'Continuar no reanuda los relojes.');
  await page.click('#clock-reset');
  assert.deepEqual((await galleryClocks()).map(clockSeconds), [60, 60]);
  assert((await page.$eval('#clock-status', el => el.textContent)).includes('Reloj detenido'));
  // Los botones de entrada deben reiniciar las animaciones de ambos formatos.
  for (const piece of ['mosca', 'nombre', 'inicio']) {
    await page.click(`[data-replay="${piece}"]`);
    const animation = await page.$$eval(`iframe[data-piece="${piece}"]`, frames => frames.map(frame => frame.contentDocument.getAnimations().map(a => ({ state: a.playState, time: a.currentTime }))));
    assert(animation.length === 2 && animation.every(items => items.length && items.every(a => a.state === 'running' && a.time < 500)), `Ver entrada no reinicia ${piece}: ${JSON.stringify(animation)}`);
  }
  await delay(1700);
  // Conserva una captura de la galería con sus valores de muestra originales.
  for (const [key, value] of Object.entries({ name: 'ANA PÉREZ', role: 'CONDUCTORA', title: 'ENCUENTRO\nFRATERNIDAD', subtitle: 'Campus Central' })) {
    await page.$eval(`#sample-${key}`, el => { el.value = ''; });
    await page.type(`#sample-${key}`, value);
  }
  await page.select('#duration', '300');
  await page.evaluate(() => scrollTo(0, 0));
  const path = join(out, `galeria-${width}.png`);
  await page.screenshot({ path, fullPage: true });
  galleries.push({ width, height, path, layout });
  pass(`Galería ${width}px: seis vistas nativas, sin desborde; edición, fondos, áreas seguras, entradas y reloj funcionan.`);
}
try {
  for (const piece of ['mosca', 'nombre', 'inicio']) {
    for (const [aspect, width, height] of [['16:9', 1920, 1080], ['9:16', 1080, 1920]]) {
      await page.setViewport({ width, height, deviceScaleFactor: 1 });
      await page.goto(`${base}/pilotos-fraternidad/resource.html?piece=${piece}&aspecto=${encodeURIComponent(aspect)}&autoplay=0`, { waitUntil: 'networkidle2' });
      await waitReady();
      await page.evaluate(() => {
        window.PILOT.setClock({ durationMs: 120000, running: false });
        window.PILOT.setBackground('scene');
        window.PILOT.setSafe(false);
      });
      await frameState();
      const measurements = await page.evaluate(measureLayout);
      assert.deepEqual(measurements.viewport, [width, height]);
      validateLayout(measurements, piece, aspect);
      const slug = `${piece}-${aspect.replace(':', 'x')}`;
      const scene = join(out, `${slug}.png`), repeat = join(out, `${slug}-repetido.png`);
      await page.screenshot({ path: scene });
      await page.evaluate(() => { window.PILOT.seek(250); window.PILOT.seek(1600); });
      await delay(120);
      await page.screenshot({ path: repeat });
      const changed = difference(scene, repeat, join(out, `${slug}-comparacion`));
      assert(changed < 1500, `${piece} ${aspect}: seek no reproduce el mismo cuadro (${changed} píxeles fuertes).`);
      await page.evaluate(() => window.PILOT.setBackground('transparent'));
      const alpha = join(out, `${slug}-alfa.png`);
      await page.screenshot({ path: alpha, omitBackground: true });
      await page.evaluate(() => window.PILOT.setBackground('ivory'));
      await page.screenshot({ path: join(out, `${slug}-sobre-marfil.png`) });
      renders.push({ piece, aspect, scene, alpha, differences: changed, measurements });
      pass(`${piece} ${aspect}: contenido dentro de áreas seguras, logo original cargado y seek repetible (${changed} píxeles AE).`);
    }
  }
  await page.setViewport({ width: 1920, height: 1080, deviceScaleFactor: 1 });
  await page.goto(`${base}/pilotos-fraternidad/resource.html?piece=inicio&aspecto=16%3A9&autoplay=0`, { waitUntil: 'networkidle2' });
  await waitReady();
  await page.evaluate(() => { window.PILOT.seek(1600); window.PILOT.setClock({ durationMs: 120000, running: false }); });
  await delay(150);
  assert.equal(clockSeconds(await readClock()), 120);
  await delay(1100);
  assert.equal(clockSeconds(await readClock()), 120, 'El reloj pausado sigue contando.');
  await page.evaluate(() => window.PILOT.setClock({ running: true }));
  await delay(1500);
  const running = clockSeconds(await readClock());
  assert(running < 120 && running >= 117, `El reloj no avanza: ${running}`);
  await page.evaluate(() => window.PILOT.setClock({ running: false }));
  await delay(150);
  const paused = await readClock();
  await delay(1100);
  assert.equal(await readClock(), paused, 'La pausa no conserva el valor del reloj.');
  await page.evaluate(() => window.PILOT.setClock({ durationMs: 120000, running: false }));
  await delay(150);
  assert.equal(clockSeconds(await readClock()), 120);
  pass('Inicio: cuenta real de demostración con marcha, pausa y reinicio explícito.');

  await page.setViewport({ width: 1080, height: 1920, deviceScaleFactor: 1 });
  await page.goto(`${base}/pilotos-fraternidad/resource.html?piece=nombre&aspecto=9%3A16&autoplay=0`, { waitUntil: 'networkidle2' });
  await waitReady();
  await page.evaluate(() => { window.PILOT.setFields({ name: 'MARÍA JOSÉ GONZÁLEZ', role: 'COORDINADORA DE COMUNIDAD' }); window.PILOT.seek(1600); });
  await delay(150);
  assert(await page.evaluate(() => document.body.textContent.includes('MARÍA JOSÉ GONZÁLEZ')));
  const overflow = await page.$$eval('[data-field]', els => els.filter(el => el.clientWidth && el.scrollWidth > el.clientWidth + 1).map(el => el.getAttribute('data-field')));
  assert.deepEqual(overflow, [], 'La muestra larga desborda el texto.');
  validateLayout(await page.evaluate(measureLayout), 'nombre', '9:16');
  await page.screenshot({ path: join(out, 'nombre-vertical-texto-largo.png') });
  pass('Nombre y cargo admiten edición de muestra y texto largo en vertical.');
  for (const [aspect, width, height] of [['16:9', 1920, 1080], ['9:16', 1080, 1920]]) {
    await page.setViewport({ width, height, deviceScaleFactor: 1 });
    await page.goto(`${base}/pilotos-fraternidad/resource.html?piece=nombre&aspecto=${encodeURIComponent(aspect)}&autoplay=0`, { waitUntil: 'networkidle2' });
    await waitReady();
    await page.evaluate(() => { window.PILOT.setFields({ name: 'W'.repeat(32), role: 'COORDINADORA DE COMUNIDAD' }); window.PILOT.seek(1600); });
    assert.equal(await page.$eval('[data-field="name"]', el => el.textContent), 'W'.repeat(32), 'La muestra de 32 caracteres se truncó.');
    validateLayout(await page.evaluate(measureLayout), 'nombre', aspect);
    await page.screenshot({ path: join(out, `nombre-${aspect.replace(':', 'x')}-32-caracteres.png`) });
  }
  pass('Nombre: los 32 caracteres anchos permitidos caben sin truncarse en ambos formatos.');
  await testGallery(1440, 1000);
  await testGallery(390, 844);
  assert.deepEqual(errors, [], 'Hay errores JavaScript.');
  assert.deepEqual(failedLocal, [], 'Hay peticiones locales fallidas.');
  pass('Sin errores JavaScript ni recursos locales fallidos.');
  await writeFile(join(out, 'resultado.json'), JSON.stringify({ ok: true, checks, renders, galleries, failedExternal }, null, 2));
  console.log(`Capturas e informe: ${out}`);
} catch (e) {
  await page.screenshot({ path: join(out, 'fallo.png'), fullPage: true }).catch(() => {});
  await writeFile(join(out, 'resultado.json'), JSON.stringify({ ok: false, checks, renders, galleries, errors, failedLocal, failedExternal, error: String(e.stack || e) }, null, 2));
  throw e;
} finally { await browser.close(); }
