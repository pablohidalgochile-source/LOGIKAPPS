import { getD1 } from "../db";

export type StoredConnection = {
  user_id: string;
  provider: string;
  provider_account_id: string;
  provider_account_name: string;
  access_token_ciphertext: string;
  refresh_token_ciphertext: string;
  token_type: string;
  scopes: string;
  csrf_token: string;
  access_expires_at: number;
  refresh_expires_at: number;
  created_at: number;
  updated_at: number;
};

export type StoredOAuthFlow = {
  state: string;
  user_id: string;
  provider: string;
  verifier_ciphertext: string;
  return_to: string;
  created_at: number;
  expires_at: number;
};

export async function createOAuthFlow(flow: StoredOAuthFlow): Promise<void> {
  const db = getD1();
  await db.prepare("DELETE FROM oauth_flows WHERE expires_at < ?").bind(Date.now()).run();
  await db.prepare(`
    INSERT INTO oauth_flows (state, user_id, provider, verifier_ciphertext, return_to, created_at, expires_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).bind(flow.state, flow.user_id, flow.provider, flow.verifier_ciphertext, flow.return_to, flow.created_at, flow.expires_at).run();
}

export async function consumeOAuthFlow(state: string, userId: string, provider: string): Promise<StoredOAuthFlow | null> {
  const db = getD1();
  const flow = await db.prepare(`
    SELECT state, user_id, provider, verifier_ciphertext, return_to, created_at, expires_at
    FROM oauth_flows WHERE state = ? AND user_id = ? AND provider = ? LIMIT 1
  `).bind(state, userId, provider).first<StoredOAuthFlow>();
  await db.prepare("DELETE FROM oauth_flows WHERE state = ?").bind(state).run();
  if (!flow || flow.expires_at < Date.now()) return null;
  return flow;
}

export async function getConnection(userId: string, provider: string): Promise<StoredConnection | null> {
  return getD1().prepare(`
    SELECT user_id, provider, provider_account_id, provider_account_name,
      access_token_ciphertext, refresh_token_ciphertext, token_type, scopes, csrf_token,
      access_expires_at, refresh_expires_at, created_at, updated_at
    FROM account_connections WHERE user_id = ? AND provider = ? LIMIT 1
  `).bind(userId, provider).first<StoredConnection>();
}

export async function saveConnection(connection: StoredConnection): Promise<void> {
  await getD1().prepare(`
    INSERT INTO account_connections (
      user_id, provider, provider_account_id, provider_account_name,
      access_token_ciphertext, refresh_token_ciphertext, token_type, scopes, csrf_token,
      access_expires_at, refresh_expires_at, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(user_id, provider) DO UPDATE SET
      provider_account_id = excluded.provider_account_id,
      provider_account_name = excluded.provider_account_name,
      access_token_ciphertext = excluded.access_token_ciphertext,
      refresh_token_ciphertext = excluded.refresh_token_ciphertext,
      token_type = excluded.token_type,
      scopes = excluded.scopes,
      csrf_token = excluded.csrf_token,
      access_expires_at = excluded.access_expires_at,
      refresh_expires_at = excluded.refresh_expires_at,
      updated_at = excluded.updated_at
  `).bind(
    connection.user_id, connection.provider, connection.provider_account_id, connection.provider_account_name,
    connection.access_token_ciphertext, connection.refresh_token_ciphertext, connection.token_type,
    connection.scopes, connection.csrf_token, connection.access_expires_at, connection.refresh_expires_at,
    connection.created_at, connection.updated_at,
  ).run();
}

export async function updateConnectionTokens(input: {
  userId: string;
  provider: string;
  accessTokenCiphertext: string;
  refreshTokenCiphertext: string;
  accessExpiresAt: number;
  refreshExpiresAt: number;
  scopes: string;
}): Promise<void> {
  await getD1().prepare(`
    UPDATE account_connections SET access_token_ciphertext = ?, refresh_token_ciphertext = ?,
      access_expires_at = ?, refresh_expires_at = ?, scopes = ?, updated_at = ?
    WHERE user_id = ? AND provider = ?
  `).bind(
    input.accessTokenCiphertext, input.refreshTokenCiphertext, input.accessExpiresAt,
    input.refreshExpiresAt, input.scopes, Date.now(), input.userId, input.provider,
  ).run();
}

export async function deleteConnection(userId: string, provider: string): Promise<void> {
  await getD1().prepare("DELETE FROM account_connections WHERE user_id = ? AND provider = ?").bind(userId, provider).run();
}

