/* Relocalización y control negativo sobre una copia temporal, sin abrir OBS. */
import assert from 'node:assert/strict';
import { cp, mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { verify } from './verificar.mjs';
import { fileReferences, readJson } from './common.mjs';
const original = resolve(process.argv[2] || resolve(import.meta.dirname, '..'));
const temp = await mkdtemp(join(tmpdir(), 'FRATV traslado con espacios '));
try {
  await verify(original);
  const relocated = join(temp, 'Kit en otra carpeta');
  await cp(original, relocated, { recursive: true });
  const checked = await verify(relocated);
  const prepared = JSON.parse(execFileSync(process.execPath, [join(relocated, 'herramientas/preparar.mjs'), relocated], { encoding: 'utf8' }));
  assert.equal(prepared.obsModified, false);
  assert.deepEqual(prepared.collections.map(item => item.scenes), [4, 14]);
  const full = await readJson(prepared.collections[1].path);
  const paths = fileReferences(full);
  assert.equal(paths.length, 7);
  assert.ok(paths.every(path => path.startsWith(join(relocated, 'app'))));
  await verify(relocated);
  const probe = join(relocated, 'app/pack/png/flag.png');
  const bytes = await readFile(probe);
  await writeFile(probe, Buffer.concat([bytes, Buffer.from('control de integridad')]));
  const negative = spawnSync(process.execPath, [join(relocated, 'herramientas/verificar.mjs'), relocated], { encoding: 'utf8' });
  assert.notEqual(negative.status, 0, 'El verificador dejó pasar una alteración.');
  await writeFile(probe, bytes);
  await verify(relocated);
  console.log(JSON.stringify({ ok: true, relocationWithSpaces: true, fileCount: checked.files, preparedSceneCounts: [4, 14], mediaPathsExist: 7, alterationRejected: true, obsModified: false }, null, 2));
} finally { await rm(temp, { recursive: true, force: true }); }
