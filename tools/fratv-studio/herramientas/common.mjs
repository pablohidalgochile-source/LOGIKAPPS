import { readFile, readdir, lstat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve, relative, sep } from 'node:path';
export const channels = [
  { key: 'inicio', label: 'Inicio', resource: 'fraternidad-start', channel: 'fraternidad-obs-inicio', mode: 'countdown' },
  { key: 'cuenta', label: 'Cuenta regresiva', resource: 'fraternidad-countdown', channel: 'fraternidad-obs-cuenta', mode: 'countdown' },
  { key: 'envivo', label: 'En vivo', resource: 'fraternidad-live', channel: 'fraternidad-obs-envivo', mode: 'elapsed' },
  { key: 'pausa', label: 'Pausa', resource: 'fraternidad-break', channel: 'fraternidad-obs-pausa', mode: 'countdown' },
];
export const media = [
  'pack/png/flag.png', 'pack/video/ident-long_60fps_alfa.mov',
  'pack/video/live-badge_60fps_alfa.mov', 'pack/video/bumper-in_60fps.mp4',
  'pack/video/bumper-out_60fps.mp4', 'pack/video/end-credits_60fps.mp4',
  'pack/video/stinger_60fps_alfa.mov',
];
export const marker = '__FRATV_APP__';
export const stamp = () => new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
export const sha = bytes => createHash('sha256').update(bytes).digest('hex');
export function inside(root, path) {
  const file = resolve(root, path);
  if (!file.startsWith(resolve(root) + sep)) throw Error('Una ruta sale del paquete.');
  return file;
}
export async function walk(root, folder = root) {
  const files = [];
  for (const item of await readdir(folder, { withFileTypes: true })) {
    const file = resolve(folder, item.name);
    const info = await lstat(file);
    if (info.isSymbolicLink()) throw Error(`No se admiten enlaces simbólicos: ${relative(root, file)}`);
    if (info.isDirectory()) files.push(...await walk(root, file));
    else if (info.isFile()) files.push(relative(root, file).split(sep).join('/'));
  }
  return files.sort();
}
export async function readJson(file) { return JSON.parse(await readFile(file, 'utf8')); }
export function liveUrl(clock, aspect = '16:9') {
  const query = new URLSearchParams({ channel: clock.channel, aspecto: aspect, autoplay: '1', tipo: 'aprobado', liveMode: clock.mode, liveDurationMs: '300000' });
  return `http://127.0.0.1:5178/live/${clock.resource}?${query}`;
}
export function fileReferences(value) {
  const paths = [];
  function visit(node) {
    if (!node || typeof node !== 'object') return;
    for (const [key, val] of Object.entries(node)) {
      if (['file', 'local_file', 'path'].includes(key) && typeof val === 'string' && val) paths.push(val);
      else if (typeof val === 'object') visit(val);
    }
  }
  visit(value);
  return [...new Set(paths)];
}
