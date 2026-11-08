/* FRATV — lámina de contacto: renderiza los recursos en el formato pedido.
   Uso:  node renderizar-laminas.mjs [16:9|9:16|1:1|4:5] [--t=0.45] [--salida=carpeta]
   Sirve para revisar composición de un vistazo y para verificar que un cambio
   no movió nada: AE=0 contra una lámina anterior significa idéntico al píxel. */
import puppeteer from 'puppeteer-core';
import { readFileSync, mkdirSync } from 'fs';
import { execFileSync } from 'child_process';
import { resolve } from 'path';
import { CHROME } from './chrome.mjs';

const RAIZ   = resolve(import.meta.dirname, '..', 'handoff');
const MAN    = JSON.parse(readFileSync(`${RAIZ}/manifest.json`, 'utf8'));

const arg = (n, d) => (process.argv.find(a => a.startsWith('--' + n + '=')) || '=' + d).split('=')[1];
const ASPECTO = process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : '16:9';
const FRACCION = parseFloat(arg('t', '0.45'));
const SALIDA = resolve(arg('salida', `${RAIZ}/../laminas/${ASPECTO.replace(':', 'x')}`));

/* Contenido de muestra: sin esto varios recursos salen con campos vacíos y la
   lámina no sirve para juzgar la composición (el chip de tema, por ejemplo,
   viene oculto hasta que alguien le pasa texto). */
const MUESTRA = {
  'lower-third':        { topic: 'La pelea por el barrio', topicLabel: 'TEMA' },
  'lower-third-evento': { topic: 'La pelea por el barrio', topicLabel: 'TEMA' },
};

const dim = MAN.aspects[ASPECTO];
if (!dim) { console.error(`Formato desconocido: ${ASPECTO}`); process.exit(1); }
mkdirSync(SALIDA, { recursive: true });

const nav = await puppeteer.launch({
  executablePath: CHROME, headless: 'shell',
  args: ['--no-sandbox', '--allow-file-access-from-files', '--force-device-scale-factor=1']
});
const pg = await nav.newPage();
await pg.setViewport({ width: dim.w, height: dim.h, deviceScaleFactor: 1 });

const hechos = [];
for (const r of MAN.resources) {
  if (!r.aspects.includes(ASPECTO)) { console.log(`  —  ${r.id} (no declara ${ASPECTO})`); continue; }
  const t = r.durationMs ? Math.round(r.durationMs * FRACCION) : 0;
  const extra = Object.entries(MUESTRA[r.id] || {})
    .map(([k, v]) => `&${k}=${encodeURIComponent(v)}`).join('');
  await pg.goto(`file://${RAIZ}/${r.file}?autoplay=0&aspecto=${encodeURIComponent(ASPECTO)}${extra}`, { waitUntil: 'networkidle0' });
  await pg.evaluate(() => document.fonts.ready);
  await pg.evaluate(() => Promise.all([...document.images].map(i => i.complete ? 1 : new Promise(r => { i.onload = i.onerror = r; }))));
  await pg.evaluate(tt => window.FRATV && window.FRATV.seek(tt), t);
  await new Promise(r => setTimeout(r, 180));
  const png = `${SALIDA}/${r.id}.png`;
  await pg.screenshot({ path: png, omitBackground: true });
  hechos.push(png);
  console.log(`  ✓  ${r.id}  (t=${t}ms)`);
}
await nav.close();

/* Contacto sobre damero, para que el alfa se vea. */
if (hechos.length) {
  const hoja = `${SALIDA}/_CONTACTO.png`;
  const celdaW = Math.round(360 * (dim.w / dim.h >= 1 ? 1 : dim.w / dim.h) * (dim.w / dim.h >= 1 ? 1 : 1));
  const alto = dim.w >= dim.h ? Math.round(360 * dim.h / dim.w) : 560;
  const ancho = dim.w >= dim.h ? 360 : Math.round(560 * dim.w / dim.h);
  execFileSync('magick', ['montage',
    ...hechos.flatMap(f => ['(', f, '-background', '#4a4a4a', '-flatten', ')']),
    '-tile', dim.w >= dim.h ? '4x' : '6x',
    '-geometry', `${ancho}x${alto}+12+12`,
    '-background', '#1a1a1a', '-bordercolor', '#1a1a1a',
    '-label', '%t', '-fill', '#e8e8e8', '-pointsize', '15',
    hoja]);
  console.log(`\nlámina: ${hoja}`);
}
console.log(`${hechos.length} recursos en ${ASPECTO} (${dim.w}×${dim.h}) → ${SALIDA}`);
