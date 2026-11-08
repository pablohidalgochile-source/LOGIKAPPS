/* Genera un kit nuevo. Nunca escribe en la configuración de OBS. */
import { readFile, writeFile, mkdir, copyFile, chmod, lstat } from 'node:fs/promises';
import { resolve, join, basename } from 'node:path';
import { homedir } from 'node:os';
import { execFileSync } from 'node:child_process';
import { channels, media, stamp, sha, walk, inside, readJson } from './common.mjs';
import { sanitizeCollection } from './collection.mjs';
const root = resolve(import.meta.dirname, '../..');
const outputParent = resolve(process.argv[2] || join(root, 'editor/.local/transferencia-obs'));
const target = join(outputParent, `FRATV-OBS-ARM64-${stamp()}`);
const sourceCollection = process.argv[3] || join(homedir(), 'Library/Application Support/obs-studio/basic/scenes/FRATV_MAESTRA_FRATERNIDAD.json');
const projectInput = process.argv[4] || null;
const projects = [];
const evidenceInput = process.argv[5] || null;
const sourceEvidence = [];
const tools = ['common.mjs', 'collection.mjs', 'generar.mjs', 'verificar.mjs', 'preparar.mjs', 'diagnostico.mjs', 'respaldar.mjs', 'probar.mjs', 'comprobar-obs.mjs', 'GUIA.md', 'PROMPT-DESTINO.md'];
const rootAllowed = new Set(['.gitignore', 'AGENTS.md', 'HANDOFF-CODEX.md', 'LEEME-OBS.md', 'NOTAS-FORMATOS-ALFA.md', 'ABRIR-EDITOR-Y-OBS.command']);
const allowed = file => rootAllowed.has(file) || /^(editor\/(src\/|public\/|tests\/|server\/|package(?:-lock)?\.json$|index\.html$|vite\.config\.ts$|tsconfig[^/]*\.json$|README\.md$|\.gitignore$)|handoff\/|laminas\/(referencia-(16x9|9x16|fraternidad-16x9|fraternidad-9x16)\/|APROBACION-FRATERNIDAD\.md$)|propuestas\/fraternidad-v1\/|scripts\/[^/]+\.(mjs|json)$)/.test(file);
const blocked = /(^|\/)(node_modules|\.git|\.local|dist|obs-backups|plugin_config|profiles)(\/|$)|(^|\/)(\.env(?:\..*)?|service\.json|global\.ini|user\.ini)$/;
const tracked = execFileSync('git', ['ls-files', '-z'], { cwd: root }).toString().split('\0').filter(Boolean);
const selected = tracked.filter(file => allowed(file) && !blocked.test(file));
const sourceCommit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
const changes = execFileSync('git', ['status', '--porcelain', '--untracked-files=no'], { cwd: root, encoding: 'utf8' }).trim();
const { full, clocks } = sanitizeCollection(await readJson(sourceCollection));
await mkdir(outputParent, { recursive: true });
await mkdir(target); // No reemplaza paquetes anteriores.
async function copy(source, relative) {
  const info = await lstat(source);
  if (!info.isFile() || info.isSymbolicLink()) throw Error('Solo se copian archivos regulares.');
  const dest = inside(target, relative);
  await mkdir(resolve(dest, '..'), { recursive: true });
  await copyFile(source, dest);
  if (relative.endsWith('.command')) await chmod(dest, 0o755);
}
for (const file of [...selected, ...media]) await copy(inside(root, file), `app/${file}`);
for (const file of tools) {
  await copy(join(import.meta.dirname, file), `herramientas/${file}`);
  await copy(join(import.meta.dirname, file), `app/scripts/transferencia-obs/${file}`);
}
if (projectInput) {
  const bytes = await readFile(projectInput);
  const project = JSON.parse(bytes);
  if (sha(bytes) !== '7dcd8d779c217f9ca03ebb2aab50ef72aa5dbb7143e88a3c4dcbcea26d8981e2' || project.schema !== 'fratv-project' || project.version !== 1 || !Array.isArray(project.items) || project.items.length !== 0)
    throw Error('El proyecto no coincide con la exportación revisada. Revísalo antes de incorporarlo.');
  await copy(projectInput, 'proyectos/Mi-programa.fratv.json');
  projects.push({ path: 'proyectos/Mi-programa.fratv.json', name: project.name, itemCount: project.items.length, sha256: sha(bytes), provenance: 'Exportado mediante la interfaz del editor; único proyecto observado en ese navegador. No acredita proyectos de otros navegadores u orígenes.' });
}
if (evidenceInput) {
  const evidenceNames = ['inicio-pausado.png', 'cuenta-pausado.png', 'envivo-pausado.png', 'pausa-pausado.png'];
  for (const file of evidenceNames) {
    const bytes = await readFile(join(evidenceInput, file));
    if (!bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) throw Error('Una evidencia de origen no es PNG.');
    await copy(join(evidenceInput, file), `evidencia-origen/${file}`);
    sourceEvidence.push({ path: `evidencia-origen/${file}`, sha256: sha(bytes), context: 'Prueba anterior en el Mac de origen; no acredita el destino.' });
  }
  const originalReport = await readJson(join(evidenceInput, 'comprobacion-obs.json'));
  const cleaned = { context: 'Mac de origen, 31 de octubre de 2026. No es una prueba del destino.', version: originalReport.version, scenes: originalReport.scenes, checks: originalReport.checks.map(check => {
    const file = basename(check.captura);
    if (!evidenceNames.includes(file)) throw Error('Ruta de evidencia no prevista.');
    return { reloj: check.reloj, inicio: check.inicio, pausa: check.pausa, captura: file, ok: check.ok };
  }) };
  await writeFile(join(target, 'evidencia-origen/comprobacion-obs.json'), JSON.stringify(cleaned, null, 2) + '\n');
}
await mkdir(join(target, 'plantillas'));
await writeFile(join(target, 'plantillas/maestra.json'), JSON.stringify(full, null, 2) + '\n');
await writeFile(join(target, 'plantillas/cuatro-relojes.json'), JSON.stringify(clocks, null, 2) + '\n');
await copy(join(import.meta.dirname, 'GUIA.md'), 'LEEME-PRIMERO.md');
await copy(join(import.meta.dirname, 'PROMPT-DESTINO.md'), 'PROMPT-PARA-OTRO-AGENTE.md');
const wrappers = {
  'DIAGNOSTICO.command': 'node herramientas/diagnostico.mjs .',
  'VERIFICAR.command': 'node herramientas/verificar.mjs .',
  'PREPARAR-COLECCIONES.command': 'node herramientas/preparar.mjs .',
  'ABRIR-ESTUDIO.command': 'exec ./app/ABRIR-EDITOR-Y-OBS.command',
};
for (const [name, command] of Object.entries(wrappers)) {
  await writeFile(join(target, name), `#!/bin/bash\nset -e\ncd "$(dirname "$0")"\nexport PATH="$PATH:/opt/homebrew/bin:/usr/local/bin"\nif ! command -v node >/dev/null 2>&1; then\n  echo "Falta Node 22.18 o posterior. Revisa LEEME-PRIMERO.md; no se instaló nada."\n  exit 1\nfi\n${command}\n`, { mode: 0o755 });
}
const files = [];
for (const file of await walk(target)) {
  const bytes = await readFile(inside(target, file));
  files.push({ path: file, bytes: bytes.length, sha256: sha(bytes) });
}
const manifest = {
  schema: 'fratv-transferencia-obs/1', createdAt: new Date().toISOString(), sourceCommit,
  sourceHasTrackedChanges: Boolean(changes), target: { os: 'macOS', architecture: 'arm64', obsTested: '33.0.1', macOSMinimumForTestedOBS: '13.0', nodeMinimum: '22.18.0', nodeRecommended: '24 LTS', nodeUsedToGenerate: process.versions.node },
  base: 'http://127.0.0.1:5178', legacyBase: 'http://127.0.0.1:8790', dock: 'http://127.0.0.1:5178/live-control?grupo=fraternidad',
  channels, projects, sourceEvidence, media: media.map(path => `app/${path}`), collectionSceneCounts: { 'plantillas/maestra.json': 14, 'plantillas/cuatro-relojes.json': 4 },
  omitted: ['Credenciales y perfiles de OBS', 'Configuración privada de plugins', 'Dispositivos del Mac de origen', 'Atajos locales', 'Proyectos del navegador no exportados', 'node_modules y cachés', 'Aplicaciones e instaladores', 'Historial .local y respaldos privados'],
  offline: false, offlineLimit: 'Las fuentes de Google Fonts y logos externos aún necesitan internet; no se promete instalación sin red.',
  files,
};
const manifestBytes = JSON.stringify(manifest, null, 2) + '\n';
await writeFile(join(target, 'manifest.json'), manifestBytes);
await writeFile(join(target, 'MANIFEST.sha256'), `${sha(Buffer.from(manifestBytes))}  manifest.json\n`);
console.log(JSON.stringify({ package: target, files: files.length, bytes: files.reduce((sum, file) => sum + file.bytes, 0), manifestSHA256: sha(Buffer.from(manifestBytes)), projectsExported: projects.length, obsConfigurationModified: false }, null, 2));
