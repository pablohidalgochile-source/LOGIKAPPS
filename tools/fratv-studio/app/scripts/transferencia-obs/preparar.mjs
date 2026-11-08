/* Escribe copias listas para importar dentro del kit; nunca escribe en OBS. */
import { readFile, writeFile, mkdir, stat } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { verify } from './verificar.mjs';
import { marker, media, stamp, fileReferences, inside } from './common.mjs';
const root = resolve(process.argv[2] || resolve(import.meta.dirname, '..'));
try {
  await verify(root);
  const suffix = `${stamp()}-${randomUUID().slice(0, 6)}`;
  const output = join(root, 'colecciones-preparadas', suffix);
  await mkdir(output, { recursive: true });
  const report = [];
  for (const [file, label] of [['cuatro-relojes.json', 'FRATERNIDAD · ENSAYO'], ['maestra.json', 'FRATV + FRATERNIDAD · ENSAYO']]) {
    const collection = JSON.parse(await readFile(join(root, 'plantillas', file), 'utf8'));
    function migrate(node) {
      if (!node || typeof node !== 'object') return;
      for (const [key, value] of Object.entries(node)) {
        if (['file', 'local_file', 'path'].includes(key) && typeof value === 'string' && value.startsWith(`${marker}/`)) {
          const relative = value.slice(marker.length + 1);
          if (!media.includes(relative)) throw Error('Medio no previsto en la plantilla.');
          node[key] = inside(join(root, 'app'), relative);
        } else migrate(value);
      }
    }
    migrate(collection);
    collection.name = `${label} ${suffix}`;
    for (const file of fileReferences(collection)) if (!(await stat(file)).isFile()) throw Error('Falta un medio de la colección preparada.');
    const path = join(output, file);
    await writeFile(path, JSON.stringify(collection, null, 2) + '\n', { flag: 'wx' });
    report.push({ path, name: collection.name, scenes: collection.sources.filter(source => source.id === 'scene').length, media: fileReferences(collection).length });
  }
  console.log(JSON.stringify({ ok: true, obsModified: false, output, collections: report, next: 'Importa primero cuatro-relojes.json desde OBS. No reemplaces tus colecciones actuales. La maestra requiere reasignar cámaras y audio.' }, null, 2));
} catch (error) { console.error(`No se prepararon las colecciones: ${error.message}`); process.exitCode = 1; }
