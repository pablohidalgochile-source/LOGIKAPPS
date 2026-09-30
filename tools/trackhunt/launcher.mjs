import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { createServer } from 'node:net';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
const [major, minor] = process.versions.node.split('.').map(Number);
if (major < 22 || (major === 22 && minor < 13)) throw new Error('TRACKHUNT necesita Node.js 22.13 o posterior. Consulta LEEME.md.');
const cli = join(root, 'node_modules/vinext/dist/cli.js');
if (!existsSync(cli) || !existsSync(join(root, 'dist/server/index.js'))) {
  console.error('Primero ejecuta Preparar TRACKHUNT.command. Abrir no instala dependencias ni compila.');
  process.exit(1);
}
const basePort = Number(process.env.PORT || 4318);
if (!Number.isInteger(basePort) || basePort < 1024 || basePort > 65525) throw new Error('PORT debe estar entre 1024 y 65525.');
const free = port => new Promise(resolve => {
  const probe = createServer();
  probe.once('error', () => resolve(false));
  probe.listen(port, '127.0.0.1', () => probe.close(() => resolve(true)));
});
let port;
for (let candidate = basePort; candidate < basePort + 10; candidate++) {
  if (await free(candidate)) { port = candidate; break; }
}
if (!port) throw new Error('Los puertos locales están ocupados. Cierra una ventana anterior o cambia PORT.');
const url = `http://127.0.0.1:${port}`;
const child = spawn(process.execPath, [cli, 'start', '--hostname', '127.0.0.1', '--port', String(port)], { cwd: root, stdio: 'inherit' });
let stopping = false;
let startupFailed = false;
function stop() { if (!stopping) { stopping = true; child.kill('SIGTERM'); } }
process.on('SIGINT', stop); process.on('SIGTERM', stop);
child.once('error', error => { console.error(error.message); process.exitCode = 1; });
child.once('close', code => { process.exitCode = startupFailed ? 1 : stopping ? 0 : (code ?? 1); });
let ready = false;
for (let attempt = 0; attempt < 120 && child.exitCode === null; attempt++) {
  try {
    const response = await fetch(`${url}/api/remix/status`, { signal: AbortSignal.timeout(1000) });
    if (response.ok) { ready = true; break; }
  } catch {}
  await new Promise(resolve => setTimeout(resolve, 250));
}
if (!ready) { startupFailed = true; console.error('TRACKHUNT no pudo iniciar. Revisa el mensaje de Terminal.'); stop(); process.exitCode = 1; }
else {
  console.log(`TRACKHUNT listo: ${url}\nMantén esta ventana abierta. Para cerrar: Control+C.`);
  if (!process.argv.includes('--no-open') && process.platform === 'darwin') {
    const opener = spawn('/usr/bin/open', [url], { stdio: 'ignore' });
    opener.once('error', () => console.log(`Abre ${url} en tu navegador.`));
  }
}
