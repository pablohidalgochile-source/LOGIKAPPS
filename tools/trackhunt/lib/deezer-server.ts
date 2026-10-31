import { deleteConnection, getConnection, saveConnection } from "./connections-store";
import { decryptSecret, encryptSecret } from "./secret-box";
import { randomBase64Url } from "./oauth-pkce";

const PROVIDER = "deezer";

function aad(userId: string): string {
  return `trackhunt:${PROVIDER}:access:${userId}`;
}

export function deezerOAuthAad(userId: string): string {
  return `trackhunt:${PROVIDER}:oauth:${userId}`;
}

export function deezerIsConfigured(): boolean {
  return Boolean(
    process.env.DEEZER_APP_ID?.trim() &&
    process.env.DEEZER_APP_SECRET?.trim() &&
    process.env.CONNECTIONS_ENCRYPTION_KEY?.trim(),
  );
}

export function deezerRedirectUri(request: Request): string {
  return process.env.DEEZER_REDIRECT_URI?.trim() || new URL("/api/deezer/callback", request.url).toString();
}

export async function saveDeezerConnection(input: {
  userId: string;
  accessToken: string;
  expiresIn: number;
  profile: { id?: number | string; name?: string };
}): Promise<void> {
  const now = Date.now();
  const expiresAt = now + Math.max(300, input.expiresIn || 3600) * 1000;
  await saveConnection({
    user_id: input.userId,
    provider: PROVIDER,
    provider_account_id: String(input.profile.id ?? "deezer-user"),
    provider_account_name: input.profile.name || "Cuenta Deezer",
    access_token_ciphertext: await encryptSecret(input.accessToken, aad(input.userId)),
    refresh_token_ciphertext: "",
    token_type: "Bearer",
    scopes: "basic_access manage_library",
    csrf_token: randomBase64Url(24),
    access_expires_at: expiresAt,
    refresh_expires_at: expiresAt,
    created_at: now,
    updated_at: now,
  });
}

export async function deezerConnectionStatus(userId: string) {
  const connection = await getConnection(userId, PROVIDER);
  if (!connection) return { connected: false as const };
  if (connection.access_expires_at <= Date.now()) {
    await deleteConnection(userId, PROVIDER);
    return { connected: false as const, expired: true };
  }
  return {
    connected: true as const,
    accountName: connection.provider_account_name,
    csrfToken: connection.csrf_token,
    reconnectBy: new Date(connection.access_expires_at).toISOString(),
  };
}

export async function deezerAccess(userId: string): Promise<{ token: string; csrfToken: string }> {
  const connection = await getConnection(userId, PROVIDER);
  if (!connection || connection.access_expires_at <= Date.now()) {
    if (connection) await deleteConnection(userId, PROVIDER);
    throw new Error("Conecta tu cuenta de Deezer primero.");
  }
  return { token: await decryptSecret(connection.access_token_ciphertext, aad(userId)), csrfToken: connection.csrf_token };
}

export async function disconnectDeezer(userId: string): Promise<void> {
  await deleteConnection(userId, PROVIDER);
}

