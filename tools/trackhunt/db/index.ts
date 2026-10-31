import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

// Portable counterpart of D1. The pack starts with an empty local database.
let database: DatabaseSync | undefined;
function localDatabase() {
  if (!database) {
    const directory = resolve(process.env.TRACKHUNT_DATA_DIR || 'data');
    mkdirSync(directory, { recursive: true, mode: 0o700 });
    process.umask(0o077);
    database = new DatabaseSync(resolve(directory, 'connections.sqlite'));
    database.exec(`
      CREATE TABLE IF NOT EXISTS account_connections (
        user_id TEXT NOT NULL, provider TEXT NOT NULL, provider_account_id TEXT NOT NULL,
        provider_account_name TEXT NOT NULL, access_token_ciphertext TEXT NOT NULL,
        refresh_token_ciphertext TEXT NOT NULL, token_type TEXT NOT NULL, scopes TEXT NOT NULL,
        csrf_token TEXT NOT NULL, access_expires_at INTEGER NOT NULL, refresh_expires_at INTEGER NOT NULL,
        created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, PRIMARY KEY (user_id, provider)
      );
      CREATE TABLE IF NOT EXISTS oauth_flows (
        state TEXT PRIMARY KEY, user_id TEXT NOT NULL, provider TEXT NOT NULL,
        verifier_ciphertext TEXT NOT NULL, return_to TEXT NOT NULL, created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL
      );
    `);
  }
  return database;
}
export function getD1() {
  return {
    prepare(sql: string) {
      return {
        bind(...values: (string | number | null)[]) {
          return {
            async first<T>(): Promise<T | null> { return (localDatabase().prepare(sql).get(...values) as T) ?? null; },
            async run() { return localDatabase().prepare(sql).run(...values); }
          };
        }
      };
    }
  };
}
