import { readFile, lstat } from 'node:fs/promises';
import { realpathSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { channels, media, marker, sha, inside, readJson, fileReferences } from './common.mjs';
export async function verify(root) {
  root = resolve(root);
  const manifestBytes = await readFile(join(root, 'manifest.json'));
  const expectedManifest = (await readFile(join(root, 'MANIFEST.sha256'), 'utf8')).split(/\s+/)[0];
  if (sha(manifestBytes) !== expectedManifest) throw Error('El manifiesto cambió o quedó incompleto.');
  const manifest = JSON.parse(manifestBytes);
  if (manifest.schema !== 'fratv-transferencia-obs/1' || !Array.isArray(manifest.files)) throw Error('Formato de paquete no admitido.');
  const paths = new Set();
  for (const file of manifest.files) {
    if (paths.has(file.path)) throw Error('El manifiesto repite una ruta.');
    paths.add(file.path);
    if (/(^|\/)(node_modules|\.git|\.local|obs-backups|profiles|plugin_config)(\/|$)|(^|\/)(\.env(?:\..*)?|service\.json|user\.ini|global\.ini)$/.test(file.path)) throw Error(`Archivo excluido en el paquete: ${file.path}`);
    const target = inside(root, file.path), info = await lstat(target);
    if (!info.isFile() || info.isSymbolicLink()) throw Error(`Archivo no regular: ${file.path}`);
    const bytes = await readFile(target);
    if (bytes.length !== file.bytes || sha(bytes) !== file.sha256) throw Error(`Integridad incorrecta: ${file.path}`);
  }
  for (const file of media) if (!paths.has(`app/${file}`)) throw Error(`Falta el medio obligatorio: ${file}`);
  for (const [file, expectedCount] of Object.entries(manifest.collectionSceneCounts)) {
    const collection = await readJson(inside(root, file));
    const scenes = collection.sources.filter(source => source.id === 'scene');
    if (scenes.length !== expectedCount) throw Error(`Cantidad de escenas incorrecta: ${file}`);
    const ids = new Set(collection.sources.map(source => source.uuid));
    if (ids.size !== collection.sources.length) throw Error('Hay UUID de fuente repetidos.');
    for (const scene of scenes) for (const item of scene.settings.items)
      if (!ids.has(item.source_uuid)) throw Error('Un ítem apunta a una fuente inexistente.');
    for (const path of fileReferences(collection)) {
      if (!path.startsWith(`${marker}/`)) throw Error('Una plantilla contiene una ruta absoluta de origen.');
      const relative = path.slice(marker.length + 1);
      if (!media.includes(relative) || !paths.has(`app/${relative}`)) throw Error('Una plantilla referencia un medio fuera de la lista.');
    }
    for (const clock of channels) {
      const matches = collection.sources.filter(source => source.id === 'browser_source' && new URL(source.settings.url).searchParams.get('channel') === clock.channel);
      if (matches.length !== 1) throw Error(`Fuente ausente o duplicada: ${clock.label}`);
      const url = new URL(matches[0].settings.url);
      if (url.origin !== 'http://127.0.0.1:5178' || url.pathname !== `/live/${clock.resource}` || url.searchParams.get('liveMode') !== clock.mode) throw Error(`URL incorrecta: ${clock.label}`);
    }
    function check(value) {
      if (!value || typeof value !== 'object') return;
      for (const [key, item] of Object.entries(value)) {
        if (/(password|secret|token|stream.?key|authorization)/i.test(key)) throw Error('La colección contiene un campo privado.');
        if (['device', 'device_id'].includes(key) && item !== '') throw Error('Se incluyó un dispositivo del equipo de origen.');
        if (['hotkeys', 'private_settings'].includes(key) && Object.keys(item || {}).length) throw Error('La colección incluye ajustes privados o atajos.');
        check(item);
      }
    }
    check(collection);
  }
  return { ok: true, files: paths.size, media: media.length, collections: manifest.collectionSceneCounts, manifestSHA256: expectedManifest, offline: manifest.offline };
}
if (process.argv[1] && pathToFileURL(realpathSync(process.argv[1])).href === import.meta.url) {
  try { console.log(JSON.stringify(await verify(process.argv[2] || resolve(import.meta.dirname, '..')), null, 2)); }
  catch (error) { console.error(`Verificación fallida: ${error.message}`); process.exitCode = 1; }
}
