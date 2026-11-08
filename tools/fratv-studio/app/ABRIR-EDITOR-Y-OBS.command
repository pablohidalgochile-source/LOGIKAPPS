#!/bin/bash
# FRATV · arranque local. Mantén esta ventana abierta durante la transmisión.
set -e
export PATH="$PATH:/opt/homebrew/bin:/usr/local/bin"
FRATV_ROOT="$(cd "$(dirname "$0")" && pwd)"
FRATV_NODE="$(command -v node || true)"
if [ -z "$FRATV_NODE" ]; then
  echo "No encuentro Node. Instala Node 22.18 o posterior y vuelve a abrir este archivo."
  exit 1
fi

exec "$FRATV_NODE" --input-type=module - "$FRATV_ROOT" "$@" <<'NODE'
import { readFile, readdir, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { createRequire } from 'node:module';
import { createConnection } from 'node:net';
import { spawn, spawnSync } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';

const root = process.argv[2];
const options = process.argv.slice(3);
const checkOnly = options.includes('--comprobar');
const noOpen = checkOnly || options.includes('--sin-abrir');
const editor = join(root, 'editor');
const editorUrl = 'http://127.0.0.1:5178/';
const dockUrl = `${editorUrl}live-control?grupo=fraternidad`;
const legacyUrl = 'http://127.0.0.1:8790/';
const owned = [];
let closing = false;
let monitor;

async function stop(code) {
  if (closing) return;
  closing = true;
  clearInterval(monitor);
  if (owned.some(child => child.exitCode === null && child.signalCode === null))
    console.log('\nCerrando solo los servicios iniciados por esta ventana…');
  for (const child of owned)
    if (child.exitCode === null && child.signalCode === null) child.kill('SIGTERM');
  await Promise.race([
    Promise.all(owned.map(child => child.exitCode !== null || child.signalCode !== null
      ? Promise.resolve() : new Promise(done => child.once('exit', done)))),
    delay(5000),
  ]);
  process.exit(code);
}
process.on('SIGINT', () => void stop(0));
process.on('SIGTERM', () => void stop(0));
process.on('SIGHUP', () => void stop(0));

async function text(url) {
  const response = await fetch(url, { signal: AbortSignal.timeout(2500), cache: 'no-store' });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.text();
}
async function editorReady() {
  try {
    const [page, api, runtime, expected, dock] = await Promise.all([
      text(editorUrl), text(`${editorUrl}api/exports`),
      text(`${editorUrl}media/resources/fratv-runtime.js`),
      readFile(join(root, 'handoff/resources/fratv-runtime.js'), 'utf8'),
      text(dockUrl),
    ]);
    return page.includes('FRATV · Overlay Studio') && Array.isArray(JSON.parse(api)) &&
      runtime === expected && dock.includes('FRATV · Control en vivo');
  } catch { return false; }
}
async function legacyReady() {
  try {
    const [manifest, expected, runtime, expectedRuntime] = await Promise.all([
      text(`${legacyUrl}manifest.json`), readFile(join(root, 'handoff/manifest.json'), 'utf8'),
      text(`${legacyUrl}resources/fratv-runtime.js`),
      readFile(join(root, 'handoff/resources/fratv-runtime.js'), 'utf8'),
    ]);
    return manifest === expected && runtime === expectedRuntime;
  } catch { return false; }
}
function occupied(port) {
  return new Promise(done => {
    const socket = createConnection({ host: '127.0.0.1', port });
    const finish = value => { socket.destroy(); done(value); };
    socket.once('connect', () => finish(true));
    socket.once('error', error => finish(error.code !== 'ECONNREFUSED'));
    socket.setTimeout(1500, () => finish(true));
  });
}
async function newerThan(path, timestamp) {
  if (!existsSync(path)) return false;
  const info = await stat(path);
  if (!info.isDirectory()) return info.mtimeMs > timestamp;
  for (const entry of await readdir(path))
    if (await newerThan(join(path, entry), timestamp)) return true;
  return false;
}
async function currentBuild() {
  const index = join(editor, 'dist/index.html');
  if (!existsSync(index) || !existsSync(join(editor, 'dist/media/fraternidad/resources/fraternidad-start.html')))
    return false;
  const builtAt = (await stat(index)).mtimeMs;
  for (const path of ['editor/src', 'editor/public', 'editor/index.html', 'editor/package.json',
    'editor/package-lock.json', 'editor/vite.config.ts', 'handoff/resources', 'handoff/assets',
    'handoff/fraternidad', 'handoff/manifest.json', 'propuestas/fraternidad-v1',
    'laminas/referencia-16x9'])
    if (await newerThan(join(root, path), builtAt)) return false;
  return true;
}
function start(command, args, cwd, label) {
  const child = spawn(command, args, { cwd, stdio: ['ignore', 'inherit', 'inherit'] });
  owned.push(child);
  child.once('error', error => {
    console.error(`No se pudo iniciar ${label}: ${error.message}`);
    void stop(1);
  });
  child.once('exit', (code, signal) => {
    if (!closing) {
      console.error(`${label} se cerró (${signal || code}). Vuelve a abrir el lanzador.`);
      void stop(1);
    }
  });
}
async function waitReady(check, label) {
  for (let attempt = 0; attempt < 30 && !closing; attempt++) {
    if (await check()) return;
    await delay(500);
  }
  throw new Error(`${label} no quedó disponible. Revisa el mensaje de error de esta ventana.`);
}

try {
  if (options.some(option => !['--comprobar', '--sin-abrir'].includes(option)))
    throw new Error('Opciones disponibles: --comprobar o --sin-abrir.');
  const [major, minor] = process.versions.node.split('.').map(Number);
  if (major < 22 || (major === 22 && minor < 18))
    throw new Error(`Node ${process.versions.node} no alcanza: necesitas Node 22.18 o posterior.`);
  for (const [folder, packages] of [[editor, ['vite', 'react', 'react-dom/client']],
    [join(root, 'scripts'), ['puppeteer-core']]]) {
    const require = createRequire(join(folder, 'package.json'));
    for (const name of packages) {
      try { require.resolve(name); }
      catch { throw new Error(`Falta ${name}. Abre ${folder} en Terminal y ejecuta npm install una vez.`); }
    }
  }
  console.log('\nFRATV · editor y fuentes para OBS');
  const [editorUp, legacyUp] = await Promise.all([editorReady(), legacyReady()]);
  if (checkOnly) {
    console.log(`Editor, API y dock (5178): ${editorUp ? 'correctos' : 'no disponibles o diferentes'}`);
    console.log(`Recursos de escenas existentes (8790): ${legacyUp ? 'correctos' : 'no disponibles o diferentes'}`);
    console.log(`Editor: ${editorUrl}\nDock Fraternidad: ${dockUrl}`);
    process.exit(editorUp && legacyUp ? 0 : 1);
  }
  // Un puerto ocupado nunca se libera matando procesos: puede pertenecer a otra app.
  for (const [ready, port] of [[editorUp, 5178], [legacyUp, 8790]])
    if (!ready && await occupied(port))
      throw new Error(`El puerto ${port} está ocupado, pero no responde con los recursos esperados. No se cerró ningún proceso.`);
  if (!legacyUp && spawnSync('python3', ['--version'], { stdio: 'ignore' }).status !== 0)
    throw new Error('No encuentro Python 3, necesario para servir las escenas existentes en el puerto 8790.');
  if (editorUp) console.log('Reutilizando el editor y el control en vivo que ya están abiertos.');
  else {
    const preview = await currentBuild();
    console.log(preview ? 'Abriendo la compilación existente del editor.' :
      'Abriendo el editor en modo desarrollo; no se instalarán ni compilarán archivos.');
    start(process.execPath, [resolve(editor, 'node_modules/vite/bin/vite.js'),
      ...(preview ? ['preview'] : []), '--host', '127.0.0.1', '--port', '5178', '--strictPort'], editor, 'El editor');
    await waitReady(editorReady, 'El editor');
  }
  if (legacyUp) console.log('Reutilizando el servidor de las escenas existentes.');
  else {
    start('python3', ['-m', 'http.server', '8790', '--bind', '127.0.0.1', '--directory', join(root, 'handoff')],
      root, 'El servidor de escenas');
    await waitReady(legacyReady, 'El servidor de escenas');
  }
  console.log(`\nEditor: ${editorUrl}\nDock Fraternidad: ${dockUrl}\nEscenas existentes: ${legacyUrl}`);
  console.log('\nDeja esta ventana abierta mientras transmites. Control + C detiene solo los servicios que inició esta ventana.');
  console.log('Los servicios reutilizados siguen dependiendo de la ventana que los abrió.');
  if (!noOpen) {
    for (const args of [[editorUrl], ['-a', existsSync('/Applications/OBS.app') ? '/Applications/OBS.app' : 'OBS']]) {
      const result = spawnSync('open', args, { encoding: 'utf8' });
      if (result.status !== 0) console.log('No se pudo abrir una aplicación automáticamente. Puedes abrir el editor o OBS a mano.');
    }
  }
  let lost = false;
  let checking = false;
  monitor = setInterval(async () => {
    if (checking || closing) return;
    checking = true;
    const healthy = (await Promise.all([editorReady(), legacyReady()])).every(Boolean);
    if (!healthy && !lost) console.error('Un servicio dejó de responder. Revisa su ventana; vuelve a abrir el lanzador antes de transmitir.');
    if (healthy && lost) console.log('Los dos servicios volvieron a responder.');
    lost = !healthy;
    checking = false;
  }, 15000);
} catch (error) {
  console.error(`\n${error.message}`);
  await stop(1);
}
NODE
