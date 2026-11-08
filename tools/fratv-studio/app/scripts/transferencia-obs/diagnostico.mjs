/* Solo lectura: versiones, archivos y disponibilidad de servicios. */
import { execFileSync } from 'node:child_process';
import { existsSync, realpathSync } from 'node:fs';
import { resolve, join, sep } from 'node:path';
import { createRequire } from 'node:module';
import { verify } from './verificar.mjs';
const root = resolve(process.argv[2] || resolve(import.meta.dirname, '..'));
const run = (command, args) => { try { return execFileSync(command, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 5000 }).trim(); } catch { return null; } };
const versionAtLeast = (value, target) => {
  const a = String(value || '0').split('.').map(Number), b = target.split('.').map(Number);
  for (let i = 0; i < b.length; i++) { if ((a[i] || 0) > b[i]) return true; if ((a[i] || 0) < b[i]) return false; }
  return true;
};
const macOS = run('sw_vers', ['-productVersion']);
const obsPlist = '/Applications/OBS.app/Contents/Info.plist';
const report = {
  readOnly: true, node: process.versions.node, nodeRecommended: '24 LTS', nodeIsRecommendedMajor: Number(process.versions.node.split('.')[0]) === 24, nodeCompatible: versionAtLeast(process.versions.node, '22.18.0'),
  architecture: process.arch, kernelArchitecture: run('uname', ['-m']), macOS,
  macOSCompatibleWithTestedOBS: process.platform === 'darwin' && versionAtLeast(macOS, '13.0'),
  obs: existsSync(obsPlist) ? run('/usr/libexec/PlistBuddy', ['-c', 'Print :CFBundleShortVersionString', obsPlist]) : null,
  python: run('python3', ['--version']), ffmpeg: run('ffmpeg', ['-version'])?.split('\n')[0] || null,
  ffprobe: run('ffprobe', ['-version'])?.split('\n')[0] || null,
  imageMagick: run('magick', ['-version'])?.split('\n')[0] || null,
  zip: run('/usr/bin/which', ['zip']), chrome: existsSync('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'), dependencies: {}, services: {},
};
try { report.package = await verify(root); } catch (error) { report.package = { ok: false, error: error.message }; }
for (const [folder, packages] of [['editor', ['vite', 'react', 'typescript']], ['scripts', ['puppeteer-core']]]) {
  const require = createRequire(join(root, 'app', folder, 'package.json'));
  const modules = join(root, 'app', folder, 'node_modules');
  for (const name of packages) {
    try {
      const entry = realpathSync(require.resolve(name));
      report.dependencies[name] = existsSync(modules) && entry.startsWith(realpathSync(modules) + sep);
    } catch { report.dependencies[name] = false; }
  }
}
for (const [label, url] of [['editor', 'http://127.0.0.1:5178/'], ['dock', 'http://127.0.0.1:5178/live-control?grupo=fraternidad'], ['legacy', 'http://127.0.0.1:8790/manifest.json']]) {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(2000) });
    const body = await response.text();
    report.services[label] = { http: response.status, expectedContent: label === 'editor' ? body.includes('FRATV · Overlay Studio') : label === 'dock' ? body.includes('fraternidad-obs-envivo') : body.includes('resources') };
  } catch { report.services[label] = { available: false }; }
}
console.log(JSON.stringify(report, null, 2));
console.log('No se instalaron herramientas, no se iniciaron servidores y no se modificó OBS. Los servicios ausentes pueden ser normales antes del arranque.');
if (!report.nodeCompatible || process.arch !== 'arm64' || !report.macOSCompatibleWithTestedOBS || !report.package.ok) process.exitCode = 1;
