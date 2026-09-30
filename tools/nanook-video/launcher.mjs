import { spawn } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'node:net';

const root = dirname(fileURLToPath(import.meta.url));
const [major, minor] = process.versions.node.split('.').map(Number);
if (major < 22 || (major === 22 && minor < 13)) throw new Error('NANOOK VIDEO necesita Node.js 22.13 o posterior. Consulta LEEME.md.');
const basePort = Number(process.env.PORT || 4317);
if (!Number.isInteger(basePort) || basePort < 1024 || basePort > 65525) throw new Error('PORT debe estar entre 1024 y 65525.');
function openBrowser(url) {
  if (!process.argv.includes('--no-open') && process.platform === 'darwin') {
    const opener = spawn('/usr/bin/open', [url], { stdio: 'ignore' });
    opener.once('error', () => console.log(`Abre ${url} en tu navegador.`));
  }
}
async function running(port) {
  try {
    const response = await fetch(`http://127.0.0.1:${port}/api/health`, { signal: AbortSignal.timeout(1000) });
    const health = await response.json();
    return health.app === 'nanook-video' && health.downloadFolder === join(root, 'downloads');
  } catch { return false; }
}
for (let candidate = basePort; candidate < basePort + 10; candidate++) {
  if (await running(candidate)) {
    console.log(`NANOOK VIDEO ya está abierto en http://127.0.0.1:${candidate}`);
    openBrowser(`http://127.0.0.1:${candidate}`); process.exit(0);
  }
}
const free = port => new Promise(resolve => {
  const probe = createServer();
  probe.once('error', () => resolve(false));
  probe.listen(port, '127.0.0.1', () => probe.close(() => resolve(true)));
});
let port;
for (let candidate = basePort; candidate < basePort + 10; candidate++) {
  if (await free(candidate)) { port = candidate; break; }
}
if (!port) throw new Error('Los puertos locales están ocupados. Cierra una instancia anterior o cambia PORT.');
const child = spawn(process.execPath, [join(root, 'server.mjs')], { cwd: root, stdio: 'inherit', env: { ...process.env, PORT: String(port) } });
let stopping = false;
let startupFailed = false;
function stop() { if (!stopping) { stopping = true; child.kill('SIGTERM'); } }
process.on('SIGINT', stop); process.on('SIGTERM', stop);
child.once('error', error => { console.error(error.message); process.exitCode = 1; });
child.once('close', code => { process.exitCode = startupFailed ? 1 : stopping ? 0 : (code ?? 1); });
let ready = false;
for (let attempt = 0; attempt < 120 && child.exitCode === null; attempt++) {
  if (await running(port)) { ready = true; break; }
  await new Promise(resolve => setTimeout(resolve, 250));
}
if (!ready) { startupFailed = true; console.error('NANOOK VIDEO no pudo iniciar. Revisa el mensaje de Terminal.'); stop(); process.exitCode = 1; }
else {
  console.log(`NANOOK VIDEO listo: http://127.0.0.1:${port}\nMantén esta ventana abierta. Para cerrar: Control+C.`);
  openBrowser(`http://127.0.0.1:${port}`);
}
