/* FRATV · exportador de recursos a video con canal alfa.
   Abre cada recurso en Chrome sin interfaz, lo posiciona cuadro a cuadro con
   seek() y arma el video con ffmpeg. El determinismo de seek() es lo que hace
   que el video coincida exactamente con lo que se ve en el navegador.

   Uso:
     node exportar.mjs                       todo, a 60 y 30 fps
     node exportar.mjs --fps=30              solo 30
     node exportar.mjs --solo=stinger,flag   solo esos recursos
     node exportar.mjs --formatos=qtrle       solo ese formato
     node exportar.mjs --aspectos=9:16        solo vertical
     formatos: qtrle (alfa, el principal) · prores (master) · mp4 (sin alfa)
     aspectos: 16:9 · 9:16 · 1:1 · 4:5. Por omisión 16:9 y 9:16. Cada recurso
     se exporta solo en los formatos que declara en manifest.json.
*/
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { readFile, mkdir, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { extname, join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';
import { CHROME } from './chrome.mjs';

const AQUI    = dirname(fileURLToPath(import.meta.url));
const HANDOFF = resolve(AQUI, '..', 'handoff');
const PACK    = resolve(AQUI, '..', 'pack');
const TEMP    = resolve(AQUI, '..', '.tmp-cuadros');
const PUERTO  = 8799;

const args = Object.fromEntries(process.argv.slice(2)
  .filter(a => a.startsWith('--'))
  .map(a => { const [k, v] = a.slice(2).split('='); return [k, v ?? '1']; }));

const FPS       = (args.fps || '60,30').split(',').map(Number);
const SOLO      = args.solo ? args.solo.split(',') : null;
const FORMATOS  = (args.formatos || 'qtrle,mp4').split(',');
const TEMA      = args.tema || 'fratv-oficial';
const ASPECTOS  = (args.aspectos || '16:9,9:16').split(',');

/* Recursos que no tiene sentido pasar a video: dependen de la hora real.
   El countdown cuenta contra el reloj, así que en video quedaría congelado. */
const SOLO_EN_VIVO = ['countdown'];

const MIME = { '.html':'text/html;charset=utf-8', '.js':'text/javascript', '.json':'application/json',
               '.css':'text/css', '.svg':'image/svg+xml', '.png':'image/png' };

function servir() {
  const s = createServer(async (req, res) => {
    try {
      const ruta = join(HANDOFF, decodeURIComponent(req.url.split('?')[0]));
      if (!ruta.startsWith(HANDOFF)) { res.writeHead(403).end(); return; }
      const buf = await readFile(ruta);
      res.writeHead(200, { 'Content-Type': MIME[extname(ruta)] || 'application/octet-stream' });
      res.end(buf);
    } catch { res.writeHead(404).end('no encontrado'); }
  });
  return new Promise(ok => s.listen(PUERTO, '127.0.0.1', () => ok(s)));
}

function ffmpeg(params, etiqueta) {
  return new Promise((ok, falla) => {
    const p = spawn('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...params]);
    let err = '';
    p.stderr.on('data', d => { err += d; });
    p.on('close', c => c === 0 ? ok() : falla(new Error(`ffmpeg (${etiqueta}): ${err.trim().slice(0, 400)}`)));
  });
}

const relleno = (n) => String(n).padStart(5, '0');
const peso = (b) => b > 1e6 ? (b/1e6).toFixed(1)+' MB' : Math.round(b/1024)+' KB';

async function capturar(page, rec, fps, dir, aspecto) {
  const url = `http://127.0.0.1:${PUERTO}/${rec.file}?tema=${TEMA}&autoplay=0&aspecto=${encodeURIComponent(aspecto)}`;
  await page.goto(url, { waitUntil: 'networkidle0' });
  /* Sin esto el primer cuadro sale con la tipografía de reserva. */
  await page.evaluate(() => document.fonts.ready);
  await page.waitForFunction(() => !!window.FRATV, { timeout: 10000 });

  const dur = rec.durationMs;
  const total = Math.round(dur * fps / 1000);
  /* En bucle se omite el último cuadro: es idéntico al primero y produciría
     un tirón al repetir. En una sola pasada sí se incluye, para que cierre limpio. */
  const cuadros = rec.loop ? total : total + 1;

  for (let i = 0; i < cuadros; i++) {
    await page.evaluate(t => window.FRATV.seek(t), (i * 1000) / fps);
    await page.screenshot({
      path: join(dir, relleno(i) + '.png'),
      omitBackground: rec.alpha,        // alfa recto, sin premultiplicar
      captureBeyondViewport: false
    });
  }
  return cuadros;
}

async function codificar(rec, fps, dir, salida, aspecto) {
  /* El formato va en el nombre: en una carpeta conviven el horizontal y el
     vertical del mismo recurso y hay que poder distinguirlos sin abrirlos. */
  const suf = aspecto.replace(':', 'x');
  const patron = join(dir, '%05d.png');
  const base = ['-framerate', String(fps), '-i', patron];
  const hechos = [];

  /* QuickTime Animation (qtrle): compresión sin pérdida con canal alfa recto.
     Es el formato con alfa que ffmpeg escribe de forma fiable y el más liviano
     para gráficos planos. macOS lo decodifica sin problema: verificado
     generando miniaturas en Finder. ffmpeg NO sabe escribir alfa en WebM (ni
     VP8 ni VP9): el encoder lo produce pero el muxer lo descarta. Verificado.
     Ningún .mov con alfa se puede subir a WhatsApp, Instagram ni correo,
     en este códec ni en ProRes: para eso está el .mp4. */
  if (FORMATOS.includes('qtrle') && rec.alpha) {
    const f = join(salida, `${rec.id}_${suf}_${fps}fps_alfa.mov`);
    await ffmpeg([...base, '-c:v', 'qtrle', '-pix_fmt', 'argb', f], 'qtrle');
    hechos.push(f);
  }

  /* ProRes 4444: master de archivo. Mismo alfa, unas 4 veces más pesado. */
  if (FORMATOS.includes('prores')) {
    const f = join(salida, `${rec.id}_${suf}_${fps}fps_prores.mov`);
    const pix = rec.alpha ? ['-pix_fmt', 'yuva444p10le', '-alpha_bits', '16'] : ['-pix_fmt', 'yuv444p10le'];
    await ffmpeg([...base, '-c:v', 'prores_ks', '-profile:v', '4444', ...pix, '-vendor', 'apl0', f], 'prores');
    hechos.push(f);
  }

  /* MP4 sin alfa, compuesto sobre negro. Es el que OBS acepta como
     transición stinger, y sirve de previsualización. */
  if (FORMATOS.includes('mp4')) {
    const f = join(salida, `${rec.id}_${suf}_${fps}fps.mp4`);
    const sobreNegro = rec.alpha
      ? ['-filter_complex', '[0:v]format=rgba,split[a][b];[a]drawbox=c=black@1:t=fill[bg];[bg][b]overlay=format=auto[o]', '-map', '[o]']
      : [];
    await ffmpeg([...base, ...sobreNegro, '-c:v', 'libx264', '-pix_fmt', 'yuv420p',
                  '-crf', '18', '-preset', 'medium', f], 'mp4');
    hechos.push(f);
  }
  return hechos;
}

async function main() {
  if (!existsSync(CHROME)) { console.error('No encuentro Google Chrome en /Applications.'); process.exit(1); }

  const manifest = JSON.parse(await readFile(join(HANDOFF, 'manifest.json'), 'utf8'));
  let recursos = manifest.resources.filter(r => !SOLO_EN_VIVO.includes(r.id));
  if (SOLO) recursos = recursos.filter(r => SOLO.includes(r.id));

  const estaticos = recursos.filter(r => !r.durationMs);
  const animados  = recursos.filter(r => r.durationMs);

  console.log(`\n  FRATV · exportador`);
  console.log(`  ${'─'.repeat(58)}`);
  console.log(`  ${animados.length} animados · ${estaticos.length} estáticos · fps: ${FPS.join(', ')}`);
  console.log(`  formatos: ${FORMATOS.join(', ')} · aspectos: ${ASPECTOS.join(', ')} · tema: ${TEMA}\n`);

  const servidor = await servir();
  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: 'shell',
    args: ['--force-device-scale-factor=1', '--hide-scrollbars',
           '--disable-lcd-text', '--allow-file-access-from-files']
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1920, height: 1080, deviceScaleFactor: 1 });

  await mkdir(PACK, { recursive: true });
  const resumen = [];
  const t0 = Date.now();

  /* Estáticos: una sola imagen por formato, no hace falta video. */
  for (const rec of estaticos) {
    for (const aspecto of ASPECTOS.filter(a => rec.aspects.includes(a))) {
      const d = manifest.aspects[aspecto];
      await page.setViewport({ width: d.w, height: d.h, deviceScaleFactor: 1 });
      const dirPng = join(PACK, 'png');
      await mkdir(dirPng, { recursive: true });
      const url = `http://127.0.0.1:${PUERTO}/${rec.file}?tema=${TEMA}&autoplay=0&aspecto=${encodeURIComponent(aspecto)}`;
      await page.goto(url, { waitUntil: 'networkidle0' });
      await page.evaluate(() => document.fonts.ready);
      const f = join(dirPng, `${rec.id}_${aspecto.replace(':', 'x')}.png`);
      await page.screenshot({ path: f, omitBackground: rec.alpha });
      console.log(`  ✓ ${rec.id.padEnd(14)} ${aspecto.padEnd(5)} PNG estático`);
      resumen.push({ id: rec.id, aspecto, tipo: 'png', archivos: [f] });
    }
  }

  /* Animados: cuadro a cuadro, una pasada por cada formato y cada fps. */
  for (const rec of animados) {
   for (const aspecto of ASPECTOS.filter(a => rec.aspects.includes(a))) {
    const d = manifest.aspects[aspecto];
    await page.setViewport({ width: d.w, height: d.h, deviceScaleFactor: 1 });
    for (const fps of FPS) {
      const dir = join(TEMP, `${rec.id}_${aspecto.replace(':', 'x')}_${fps}`);
      await rm(dir, { recursive: true, force: true });
      await mkdir(dir, { recursive: true });

      const tA = Date.now();
      process.stdout.write(`  · ${rec.id.padEnd(14)} ${aspecto.padEnd(5)} ${String(fps).padStart(2)}fps  capturando…`);
      const n = await capturar(page, rec, fps, dir, aspecto);
      process.stdout.write(`\r  · ${rec.id.padEnd(14)} ${aspecto.padEnd(5)} ${String(fps).padStart(2)}fps  ${String(n).padStart(4)} cuadros · codificando…`);

      const salida = join(PACK, 'video');
      await mkdir(salida, { recursive: true });
      const hechos = await codificar(rec, fps, dir, salida, aspecto);
      await rm(dir, { recursive: true, force: true });

      const seg = ((Date.now() - tA) / 1000).toFixed(1);
      console.log(`\r  ✓ ${rec.id.padEnd(14)} ${aspecto.padEnd(5)} ${String(fps).padStart(2)}fps  ${String(n).padStart(4)} cuadros · ${hechos.length} archivos · ${seg}s        `);
      resumen.push({ id: rec.id, aspecto, fps, cuadros: n, bucle: rec.loop, archivos: hechos });
    }
   }
  }

  await browser.close();
  servidor.close();
  await rm(TEMP, { recursive: true, force: true });
  await writeFile(join(PACK, 'exportacion.json'), JSON.stringify({
    generado: new Date().toISOString(), tema: TEMA, fps: FPS, aspectos: ASPECTOS,
    soloEnVivo: SOLO_EN_VIVO, resumen
  }, null, 2));

  console.log(`\n  Listo en ${((Date.now() - t0) / 1000 / 60).toFixed(1)} min → ${PACK}`);
  console.log(`  Solo en vivo (no se exportan): ${SOLO_EN_VIVO.join(', ')}\n`);
}

main().catch(e => { console.error('\n  Falló:', e.message, '\n'); process.exit(1); });
