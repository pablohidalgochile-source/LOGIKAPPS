/* FRATV · estudio de PNG.
   Abre una página local donde se elige el recurso, se escriben los textos, se
   mueve el tiempo y se descarga el cuadro como PNG con transparencia real.

   La captura la hace Chrome sin interfaz con el mismo seek() del exportador,
   así que el PNG es idéntico a lo que se ve en pantalla.

   Uso:  node estudio-png.mjs     →  http://localhost:8795
*/
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { readFile, mkdir, writeFile, rm } from 'node:fs/promises';
import { join, extname, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';
import { CHROME } from './chrome.mjs';

const AQUI    = dirname(fileURLToPath(import.meta.url));
const HANDOFF = resolve(AQUI, '..', 'handoff');
const SALIDA  = resolve(AQUI, '..', 'png-exportados');
const VIDEOS  = resolve(AQUI, '..', 'videos-generados');
const TEMP    = resolve(AQUI, '..', '.tmp-estudio');
const PUERTO  = 8795;

const MIME = { '.html':'text/html;charset=utf-8', '.js':'text/javascript', '.json':'application/json',
               '.css':'text/css', '.svg':'image/svg+xml', '.png':'image/png' };

let navegador = null, pagina = null;

/* Si el Chrome anterior murió (por ejemplo al reiniciar el servidor), se
   levanta uno nuevo en vez de arrastrar una sesión cerrada. */
async function hoja() {
  const vivo = navegador && navegador.connected && pagina && !pagina.isClosed();
  if (vivo) return pagina;
  if (navegador) { try { await navegador.close(); } catch (e) {} }
  navegador = await puppeteer.launch({ executablePath: CHROME, headless: 'shell',
    args: ['--force-device-scale-factor=1', '--hide-scrollbars'] });
  pagina = await navegador.newPage();
  return pagina;
}

for (const señal of ['SIGINT', 'SIGTERM']) {
  process.on(señal, async () => { try { await navegador?.close(); } catch (e) {} process.exit(0); });
}

async function capturar({ recurso, campos, t, ancho, alto, alfa, escala, aspecto }) {
  const pg = await hoja();
  await pg.setViewport({ width: ancho, height: alto, deviceScaleFactor: escala || 1 });
  /* El formato se declara, no se deduce: así una captura a 2× (3840×2160)
     sigue componiendo como 16:9 y no como otra cosa. */
  const p = new URLSearchParams({ ...campos, autoplay: '0', ...(aspecto ? { aspecto } : {}) });
  await pg.goto(`http://127.0.0.1:${PUERTO}/${recurso}?${p}`, { waitUntil: 'networkidle0' });
  await pg.evaluate(() => document.fonts.ready);
  await pg.waitForFunction(() => !!window.FRATV, { timeout: 8000 });
  await pg.evaluate(ms => window.FRATV.seek(ms), t);
  return pg.screenshot({ omitBackground: !!alfa, type: 'png' });
}

function ffmpeg(params) {
  return new Promise((ok, falla) => {
    const p = spawn('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...params]);
    let err = '';
    p.stderr.on('data', d => { err += d; });
    p.on('close', c => c === 0 ? ok() : falla(new Error(err.trim().slice(0, 300))));
  });
}

const relleno = (n) => String(n).padStart(5, '0');

/* Exporta el recurso completo a video, cuadro a cuadro, con los textos puestos.
   Mismo método que scripts/exportar.mjs: el seek() garantiza que el video
   coincide con lo que se ve en pantalla. */
async function exportarVideo({ recurso, id, campos, fps, dur, loop, alfa, codec, nombreArchivo,
                               ancho = 1920, alto = 1080, aspecto }, avisar) {
  const pg = await hoja();
  await pg.setViewport({ width: ancho, height: alto, deviceScaleFactor: 1 });
  const p = new URLSearchParams({ ...campos, autoplay: '0', ...(aspecto ? { aspecto } : {}) });
  await pg.goto(`http://127.0.0.1:${PUERTO}/${recurso}?${p}`, { waitUntil: 'networkidle0' });
  await pg.evaluate(() => document.fonts.ready);
  await pg.waitForFunction(() => !!window.FRATV, { timeout: 8000 });

  const dir = join(TEMP, nombreArchivo);
  await rm(dir, { recursive: true, force: true });
  await mkdir(dir, { recursive: true });

  const total = Math.round(dur * fps / 1000);
  const cuadros = loop ? total : total + 1;
  for (let i = 0; i < cuadros; i++) {
    await pg.evaluate(t => window.FRATV.seek(t), (i * 1000) / fps);
    await pg.screenshot({ path: join(dir, relleno(i) + '.png'), omitBackground: alfa });
    if (i % 15 === 0) avisar({ fase: 'capturando', hecho: i, total: cuadros });
  }

  avisar({ fase: 'codificando', hecho: cuadros, total: cuadros });
  await mkdir(VIDEOS, { recursive: true });
  const hechos = [];

  if (alfa) {
    const f = join(VIDEOS, `${nombreArchivo}_alfa.mov`);
    if (codec === 'animation') {
      /* QuickTime Animation (qtrle): liviano y sin pérdida. macOS SÍ lo
         decodifica — se verificó generando miniaturas en Finder, que salen
         bien. Se mantiene como opción por su peso. Lo que ningún .mov con
         alfa admite, en este códec ni en ProRes, es subirse a WhatsApp,
         Instagram o correo: esos servicios esperan H.264 sin transparencia.
         Para compartir está el .mp4 que se genera al lado. */
      await ffmpeg(['-framerate', String(fps), '-i', join(dir, '%05d.png'),
                    '-c:v', 'qtrle', '-pix_fmt', 'argb', f]);
    } else {
      /* ProRes 4444: el estándar con alfa de la industria. Lo abren QuickTime,
         Premiere, Final Cut, DaVinci y OBS sin discusión. Pesa más que qtrle;
         es el valor por omisión porque es el que nunca da sorpresas. */
      await ffmpeg(['-framerate', String(fps), '-i', join(dir, '%05d.png'),
                    '-c:v', 'prores_ks', '-profile:v', '4444',
                    '-pix_fmt', 'yuva444p10le', '-alpha_bits', '16',
                    '-vendor', 'apl0', f]);
    }
    hechos.push(f);
  }
  const mp4 = join(VIDEOS, `${nombreArchivo}.mp4`);
  await ffmpeg(['-framerate', String(fps), '-i', join(dir, '%05d.png'),
    ...(alfa ? ['-filter_complex', '[0:v]format=rgba,split[a][b];[a]drawbox=c=black@1:t=fill[bg];[bg][b]overlay=format=auto[o]', '-map', '[o]'] : []),
    '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '18', '-preset', 'faster', mp4]);
  hechos.push(mp4);

  await rm(dir, { recursive: true, force: true });

  /* Si lo generado es un stinger, se deja listo como transición: se busca el
     cuadro donde el barrido tapa el 100 % del lienzo y se escribe ese punto
     en todas las colecciones del pack. */
  let transicion = null;
  if (id === 'stinger' && alfa) {
    const mov = hechos.find(f => f.endsWith('_alfa.mov'));
    if (mov) transicion = await automatizarStinger(mov, fps, dur, avisar);
  }

  return { archivos: hechos, cuadros, carpeta: VIDEOS, transicion };
}

/* Mide en qué momento el barrido cubre el cuadro entero. No se asume: se
   extrae el canal alfa de varios cuadros y se busca el primero al 100 %. */
async function puntoDeCorte(mov, fps, dur) {
  const total = Math.round(dur * fps / 1000);
  const medir = (n) => new Promise((ok) => {
    const p = spawn('ffmpeg', ['-v', 'error', '-i', mov, '-vf',
      `select=eq(n\\,${n}),alphaextract,scale=80:45`, '-frames:v', '1',
      '-f', 'rawvideo', '-pix_fmt', 'gray', '-']);
    const trozos = [];
    p.stdout.on('data', d => trozos.push(d));
    p.on('close', () => {
      const b = Buffer.concat(trozos);
      if (!b.length) return ok(0);
      let opacos = 0;
      for (const v of b) if (v > 247) opacos++;
      ok(opacos / b.length);
    });
  });

  /* Se recorre el clip y se guardan TODOS los cuadros que tapan el lienzo.
     El punto va al centro de ese tramo, no al primero: así queda el mayor
     margen posible a cada lado por si el reloj de OBS se desvía un cuadro. */
  const paso = Math.max(1, Math.round(total / 24));
  const llenos = [];
  let mejor = Math.round(total / 2), mejorCob = 0;
  for (let n = 1; n < total - 1; n += paso) {
    const cob = await medir(n);
    if (cob > mejorCob) { mejorCob = cob; mejor = n; }
    if (cob >= 0.999) llenos.push(n);
  }
  const centro = llenos.length
    ? llenos[Math.floor((llenos.length - 1) / 2)]
    : mejor;
  return { ms: Math.round(centro * 1000 / fps),
           cobertura: +((llenos.length ? 1 : mejorCob) * 100).toFixed(1),
           tramo: llenos.length ? `${Math.round(llenos[0]*1000/fps)}–${Math.round(llenos[llenos.length-1]*1000/fps)} ms` : null };
}

async function automatizarStinger(mov, fps, dur, avisar) {
  avisar({ fase: 'midiendo', mensaje: 'buscando el punto de corte' });
  const { ms, cobertura } = await puntoDeCorte(mov, fps, dur);

  const PACK = resolve(AQUI, '..', 'pack');
  const { readdir } = await import('node:fs/promises');
  let tocadas = 0;
  try {
    for (const f of await readdir(PACK)) {
      if (!f.startsWith('FRATV_') || !f.endsWith('.json')) continue;
      const ruta = join(PACK, f);
      const col = JSON.parse(await readFile(ruta, 'utf8'));
      col.transitions = [{ name: 'FRATV Stinger', id: 'obs_stinger_transition',
                           settings: { transition_point: ms, preload: true, path: mov } }];
      col.current_transition = 'FRATV Stinger';
      await writeFile(ruta, JSON.stringify(col, null, 2));
      tocadas++;
    }
  } catch (e) { return { ms, cobertura, error: e.message }; }
  return { ms, cobertura, colecciones: tocadas };
}

const servidor = createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PUERTO}`);

  if (url.pathname === '/api/png' && req.method === 'POST') {
    let cuerpo = '';
    for await (const c of req) cuerpo += c;
    try {
      const datos = JSON.parse(cuerpo);
      const png = await capturar(datos);
      await mkdir(SALIDA, { recursive: true });
      const nombre = `${datos.nombreArchivo || 'fratv'}.png`;
      await writeFile(join(SALIDA, nombre), png);
      res.writeHead(200, {
        'Content-Type': 'image/png',
        'Content-Disposition': `attachment; filename="${nombre}"`,
        'X-Guardado-En': join(SALIDA, nombre)
      });
      res.end(png);
    } catch (e) {
      res.writeHead(500, { 'Content-Type': 'text/plain;charset=utf-8' });
      res.end('Falló la captura: ' + e.message);
    }
    return;
  }

  if (url.pathname === '/api/video' && req.method === 'POST') {
    let cuerpo = '';
    for await (const c of req) cuerpo += c;
    res.writeHead(200, { 'Content-Type': 'text/event-stream; charset=utf-8',
                         'Cache-Control': 'no-cache', 'Connection': 'keep-alive' });
    const enviar = (o) => res.write(`data: ${JSON.stringify(o)}\n\n`);
    try {
      const r = await exportarVideo(JSON.parse(cuerpo), enviar);
      enviar({ fase: 'listo', ...r });
    } catch (e) {
      enviar({ fase: 'error', mensaje: e.message });
    }
    res.end();
    return;
  }

  /* Entrega un video ya generado para descargarlo desde el navegador. */
  if (url.pathname === '/api/descargar') {
    const nombre = (url.searchParams.get('f') || '').replace(/[/\\]/g, '');
    const ruta = join(VIDEOS, nombre);
    try {
      const buf = await readFile(ruta);
      const tipo = nombre.endsWith('.mov') ? 'video/quicktime' : 'video/mp4';
      res.writeHead(200, { 'Content-Type': tipo, 'Content-Length': buf.length,
                           'Content-Disposition': `attachment; filename="${nombre}"` });
      res.end(buf);
    } catch {
      res.writeHead(404, { 'Content-Type': 'text/plain;charset=utf-8' });
      res.end('No encuentro ' + nombre);
    }
    return;
  }

  if (url.pathname === '/' || url.pathname === '/index.html') {
    res.writeHead(200, { 'Content-Type': 'text/html;charset=utf-8' });
    res.end(await readFile(join(AQUI, 'estudio-png.html')));
    return;
  }

  try {
    const ruta = join(HANDOFF, decodeURIComponent(url.pathname));
    if (!ruta.startsWith(HANDOFF)) { res.writeHead(403).end(); return; }
    const buf = await readFile(ruta);
    res.writeHead(200, { 'Content-Type': MIME[extname(ruta)] || 'application/octet-stream' });
    res.end(buf);
  } catch { res.writeHead(404).end('no encontrado'); }
});

servidor.listen(PUERTO, '127.0.0.1', () => {
  console.log(`\n  FRATV · estudio de PNG`);
  console.log(`  ${'─'.repeat(46)}`);
  console.log(`  Abre:  http://localhost:${PUERTO}`);
  console.log(`  Los PNG se guardan además en:  ${SALIDA}`);
  console.log(`\n  Para apagar: Control + C\n`);
});
