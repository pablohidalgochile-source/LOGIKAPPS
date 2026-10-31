import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import ts from 'typescript';

test('portable connections survive reopening and OAuth consumes state only once', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'trackhunt-db-'));
  const previous = process.env.TRACKHUNT_DATA_DIR;
  process.env.TRACKHUNT_DATA_DIR = directory;
  try {
    const source = ts.transpileModule(await readFile(new URL('../db/index.ts', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
    const load = suffix => import('data:text/javascript;base64,' + Buffer.from(source + '\n// ' + suffix).toString('base64'));
    const db = (await load('first')).getD1();
    await db.prepare('INSERT INTO oauth_flows VALUES (?, ?, ?, ?, ?, ?, ?)').bind('state-fixture', 'local-user', 'spotify', 'encrypted', '/', 1, 2).run();
    const reopened = (await load('second')).getD1();
    assert.equal((await reopened.prepare('SELECT user_id FROM oauth_flows WHERE state = ?').bind('state-fixture').first()).user_id, 'local-user');
    assert.equal(await reopened.prepare('SELECT user_id FROM oauth_flows WHERE state = ?').bind('missing').first(), null);
    assert.ok(await reopened.prepare('DELETE FROM oauth_flows WHERE state = ? RETURNING state').bind('state-fixture').first());
    assert.equal(await reopened.prepare('DELETE FROM oauth_flows WHERE state = ? RETURNING state').bind('state-fixture').first(), null);
    assert.equal((await stat(join(directory, 'connections.sqlite'))).mode & 0o077, 0);
  } finally {
    if (previous === undefined) delete process.env.TRACKHUNT_DATA_DIR; else process.env.TRACKHUNT_DATA_DIR = previous;
    await rm(directory, { recursive: true, force: true });
  }
});
