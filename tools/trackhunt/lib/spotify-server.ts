import { spotifyScopes } from "./connection-catalog";
import {
  deleteConnection,
  getConnection,
  saveConnection,
  updateConnectionTokens,
  type StoredConnection,
} from "./connections-store";
import { decryptSecret, encryptSecret } from "./secret-box";
import { randomBase64Url } from "./oauth-pkce";

const PROVIDER = "spotify";
const SIX_MONTHS_MS = 180 * 24 * 60 * 60 * 1000;
const SPOTIFY_TRACK_PAGE_SIZE = 50;
const MAX_SPOTIFY_TRACK_PAGES = 200;

type SpotifyTokenResponse = {
  access_token?: string;
  token_type?: string;
  scope?: string;
  expires_in?: number;
  refresh_token?: string;
  error?: string;
  error_description?: string;
};

export class SpotifyRequestError extends Error {
  constructor(message: string, public status = 502, public retryAfter: string | null = null) {
    super(message);
  }
}

function clientId(): string {
  const value = process.env.SPOTIFY_CLIENT_ID?.trim();
  if (!value) throw new SpotifyRequestError("Spotify aún no está configurado en Trackhunt.", 503);
  return value;
}

export function spotifyIsConfigured(): boolean {
  return Boolean(process.env.SPOTIFY_CLIENT_ID?.trim() && process.env.CONNECTIONS_ENCRYPTION_KEY?.trim());
}

export function spotifyRedirectUri(request: Request): string {
  return process.env.SPOTIFY_REDIRECT_URI?.trim() || new URL("/api/connections/spotify/callback", request.url).toString();
}

function aad(userId: string, kind: "access" | "refresh" | "oauth"): string {
  return `trackhunt:${PROVIDER}:${kind}:${userId}`;
}

export function spotifyOAuthAad(userId: string): string {
  return aad(userId, "oauth");
}

async function readJson<T>(response: Response): Promise<T> {
  try { return await response.json() as T; } catch { return {} as T; }
}

async function exchangeToken(params: URLSearchParams): Promise<SpotifyTokenResponse> {
  params.set("client_id", clientId());
  const response = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" },
    body: params,
  });
  const payload = await readJson<SpotifyTokenResponse>(response);
  if (!response.ok || !payload.access_token) {
    const reconnect = payload.error === "invalid_grant";
    throw new SpotifyRequestError(
      reconnect ? "La autorización de Spotify venció. Vuelve a conectar tu cuenta." : "Spotify no pudo completar la autorización.",
      reconnect ? 401 : 502,
    );
  }
  return payload;
}

export async function exchangeSpotifyCode(input: {
  code: string;
  verifier: string;
  redirectUri: string;
}): Promise<SpotifyTokenResponse> {
  return exchangeToken(new URLSearchParams({
    grant_type: "authorization_code",
    code: input.code,
    redirect_uri: input.redirectUri,
    code_verifier: input.verifier,
  }));
}

async function spotifyFetchRaw(accessToken: string, path: string, init: RequestInit = {}): Promise<Response> {
  const response = await fetch(`https://api.spotify.com/v1${path}`, {
    ...init,
    headers: {
      accept: "application/json",
      authorization: `Bearer ${accessToken}`,
      ...(init.body ? { "content-type": "application/json" } : {}),
      ...init.headers,
    },
  });
  if (response.status === 429) {
    throw new SpotifyRequestError("Spotify está limitando temporalmente las consultas. Intenta nuevamente en unos segundos.", 429, response.headers.get("retry-after"));
  }
  return response;
}

export async function spotifyFetchJson<T>(accessToken: string, path: string, init: RequestInit = {}): Promise<T> {
  const response = await spotifyFetchRaw(accessToken, path, init);
  const payload = await readJson<T & { error?: { message?: string } }>(response);
  if (!response.ok) {
    const message = (payload as { error?: { message?: string } }).error?.message;
    throw new SpotifyRequestError(
      response.status === 403
        ? "Spotify solo permite importar los temas de playlists propias o colaborativas en este modo."
        : message || "Spotify no pudo completar la consulta.",
      response.status,
    );
  }
  return payload;
}

async function refreshConnection(connection: StoredConnection): Promise<{ token: string; connection: StoredConnection }> {
  if (!connection.refresh_token_ciphertext || connection.refresh_expires_at <= Date.now()) {
    await deleteConnection(connection.user_id, PROVIDER);
    throw new SpotifyRequestError("La conexión de Spotify venció. Vuelve a conectarla.", 401);
  }
  const refreshToken = await decryptSecret(connection.refresh_token_ciphertext, aad(connection.user_id, "refresh"));
  let payload: SpotifyTokenResponse;
  try {
    payload = await exchangeToken(new URLSearchParams({ grant_type: "refresh_token", refresh_token: refreshToken }));
  } catch (error) {
    if (error instanceof SpotifyRequestError && error.status === 401) await deleteConnection(connection.user_id, PROVIDER);
    throw error;
  }
  const nextRefresh = payload.refresh_token || refreshToken;
  const accessExpiresAt = Date.now() + Math.max(60, Number(payload.expires_in ?? 3600)) * 1000;
  const refreshExpiresAt = payload.refresh_token ? Date.now() + SIX_MONTHS_MS : connection.refresh_expires_at;
  const accessTokenCiphertext = await encryptSecret(payload.access_token!, aad(connection.user_id, "access"));
  const refreshTokenCiphertext = await encryptSecret(nextRefresh, aad(connection.user_id, "refresh"));
  const scopes = payload.scope || connection.scopes;
  await updateConnectionTokens({
    userId: connection.user_id,
    provider: PROVIDER,
    accessTokenCiphertext,
    refreshTokenCiphertext,
    accessExpiresAt,
    refreshExpiresAt,
    scopes,
  });
  return {
    token: payload.access_token!,
    connection: {
      ...connection,
      access_token_ciphertext: accessTokenCiphertext,
      refresh_token_ciphertext: refreshTokenCiphertext,
      access_expires_at: accessExpiresAt,
      refresh_expires_at: refreshExpiresAt,
      scopes,
      updated_at: Date.now(),
    },
  };
}

export async function spotifyAccess(userId: string): Promise<{ token: string; connection: StoredConnection }> {
  const connection = await getConnection(userId, PROVIDER);
  if (!connection) throw new SpotifyRequestError("Conecta Spotify para usar esta función.", 401);
  if (connection.access_expires_at <= Date.now() + 60_000) return refreshConnection(connection);
  return { token: await decryptSecret(connection.access_token_ciphertext, aad(userId, "access")), connection };
}

export async function saveSpotifyConnection(input: {
  userId: string;
  token: SpotifyTokenResponse;
  profile: { account_id?: string; id?: string; display_name?: string };
}): Promise<void> {
  if (!input.token.access_token || !input.token.refresh_token) throw new SpotifyRequestError("Spotify no entregó una sesión renovable.", 502);
  const now = Date.now();
  await saveConnection({
    user_id: input.userId,
    provider: PROVIDER,
    provider_account_id: input.profile.account_id || input.profile.id || "spotify-user",
    provider_account_name: input.profile.display_name || "Cuenta Spotify",
    access_token_ciphertext: await encryptSecret(input.token.access_token, aad(input.userId, "access")),
    refresh_token_ciphertext: await encryptSecret(input.token.refresh_token, aad(input.userId, "refresh")),
    token_type: input.token.token_type || "Bearer",
    scopes: input.token.scope || spotifyScopes.join(" "),
    csrf_token: randomBase64Url(24),
    access_expires_at: now + Math.max(60, Number(input.token.expires_in ?? 3600)) * 1000,
    refresh_expires_at: now + SIX_MONTHS_MS,
    created_at: now,
    updated_at: now,
  });
}

export async function spotifyConnectionStatus(userId: string) {
  const connection = await getConnection(userId, PROVIDER);
  if (!connection) return { connected: false as const };
  if (connection.refresh_expires_at <= Date.now()) {
    await deleteConnection(userId, PROVIDER);
    return { connected: false as const, expired: true };
  }
  return {
    connected: true as const,
    accountName: connection.provider_account_name,
    scopes: connection.scopes.split(" ").filter(Boolean),
    csrfToken: connection.csrf_token,
    reconnectBy: new Date(connection.refresh_expires_at).toISOString(),
  };
}

export async function disconnectSpotify(userId: string): Promise<void> {
  await deleteConnection(userId, PROVIDER);
}

export async function fetchSpotifyProfile(accessToken: string) {
  return spotifyFetchJson<{ account_id?: string; id?: string; display_name?: string; product?: string }>(accessToken, "/me");
}

export async function listSpotifyPlaylists(userId: string, offset = 0) {
  const { token } = await spotifyAccess(userId);
  const safeOffset = Math.max(0, Math.min(1000, Math.floor(offset)));
  return spotifyFetchJson<{
    items: Array<{
      id: string;
      name: string;
      collaborative: boolean;
      public: boolean | null;
      images?: Array<{ url: string }>;
      owner?: { display_name?: string };
      tracks?: { total?: number };
      items?: { total?: number };
      external_urls?: { spotify?: string };
    }>;
    total: number;
    next: string | null;
  }>(token, `/me/playlists?limit=10&offset=${safeOffset}`);
}

export type ImportedSpotifyTrack = {
  uri: string;
  title: string;
  artist: string;
  album: string;
  durationMs: number;
  isrc: string;
  spotifyUrl: string;
};

function normalizeImportedTrack(item: unknown): ImportedSpotifyTrack | null {
  const container = item as { item?: unknown; track?: unknown };
  const raw = (container?.item || container?.track) as {
    uri?: string;
    name?: string;
    artists?: Array<{ name?: string }>;
    album?: { name?: string };
    duration_ms?: number;
    external_ids?: { isrc?: string };
    external_urls?: { spotify?: string };
    type?: string;
  } | undefined;
  if (!raw?.uri || !raw.name || raw.type === "episode") return null;
  return {
    uri: raw.uri,
    title: raw.name,
    artist: raw.artists?.map((artist) => artist.name).filter(Boolean).join(", ") || "Artista desconocido",
    album: raw.album?.name || "",
    durationMs: Number(raw.duration_ms ?? 0),
    isrc: raw.external_ids?.isrc || "",
    spotifyUrl: raw.external_urls?.spotify || "",
  };
}

async function pagedSpotifyTracks(token: string, firstPath: string): Promise<ImportedSpotifyTrack[]> {
  let path: string | null = firstPath;
  const tracks: ImportedSpotifyTrack[] = [];
  for (let page = 0; path && page < MAX_SPOTIFY_TRACK_PAGES; page += 1) {
    const payload: { items?: unknown[]; next?: string | null } = await spotifyFetchJson(token, path);
    for (const item of payload.items ?? []) {
      const track = normalizeImportedTrack(item);
      if (track) tracks.push(track);
    }
    if (!payload.next) break;
    const next = new URL(payload.next);
    if (next.protocol !== "https:" || next.hostname !== "api.spotify.com") break;
    path = `${next.pathname.replace(/^\/v1/, "")}${next.search}`;
  }
  return tracks;
}

export async function importSpotifyPlaylist(userId: string, playlistId: string) {
  const { token } = await spotifyAccess(userId);
  if (playlistId === "liked") {
    const tracks = await pagedSpotifyTracks(token, `/me/tracks?limit=${SPOTIFY_TRACK_PAGE_SIZE}`);
    return { playlist: { id: "liked", name: "Tus Me gusta", spotifyUrl: "https://open.spotify.com/collection/tracks" }, tracks };
  }
  if (!/^[A-Za-z0-9]{10,64}$/.test(playlistId)) throw new SpotifyRequestError("Identificador de playlist inválido.", 400);
  const [playlist, tracks] = await Promise.all([
    spotifyFetchJson<{ id: string; name: string; external_urls?: { spotify?: string } }>(token, `/playlists/${encodeURIComponent(playlistId)}?fields=id,name,external_urls`),
    pagedSpotifyTracks(token, `/playlists/${encodeURIComponent(playlistId)}/items?limit=${SPOTIFY_TRACK_PAGE_SIZE}`),
  ]);
  return { playlist: { id: playlist.id, name: playlist.name, spotifyUrl: playlist.external_urls?.spotify || "" }, tracks };
}

function normalized(value: string): string {
  return value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\([^)]*\)|\[[^\]]*\]/g, " ").replace(/[^a-z0-9]+/g, " ").trim();
}

export async function createSpotifyPlaylist(userId: string, input: { name: string; tracks: Array<{ artist: string; title: string }> }) {
  const { token } = await spotifyAccess(userId);
  const source = input.tracks.slice(0, 100);
  const found: Array<{ uri: string; title: string; artist: string }> = [];
  const missing: Array<{ title: string; artist: string }> = [];
  for (let index = 0; index < source.length; index += 4) {
    const batch = source.slice(index, index + 4);
    const results = await Promise.all(batch.map(async (track) => {
      const query = `track:${track.title} artist:${track.artist}`;
      const payload = await spotifyFetchJson<{
        tracks?: { items?: Array<{ uri?: string; name?: string; artists?: Array<{ name?: string }> }> };
      }>(token, `/search?type=track&limit=3&q=${encodeURIComponent(query)}`);
      const wantedTitle = normalized(track.title);
      const wantedArtist = normalized(track.artist);
      if (!wantedTitle || !wantedArtist) return null;
      const candidates = payload.tracks?.items ?? [];
      const best = candidates.find((candidate) => {
        const candidateTitle = normalized(candidate.name ?? "");
        const candidateArtists = normalized(candidate.artists?.map((artist) => artist.name).join(" ") ?? "");
        return candidate.uri && (candidateTitle.includes(wantedTitle) || wantedTitle.includes(candidateTitle)) &&
          (candidateArtists.includes(wantedArtist) || wantedArtist.includes(candidateArtists));
      });
      return best?.uri ? { uri: best.uri, title: track.title, artist: track.artist } : null;
    }));
    results.forEach((result, batchIndex) => {
      if (result) found.push(result);
      else missing.push(batch[batchIndex]);
    });
  }
  if (!found.length) throw new SpotifyRequestError("No encontramos coincidencias suficientes para crear la playlist.", 422);
  const created = await spotifyFetchJson<{ id: string; external_urls?: { spotify?: string }; name: string }>(token, "/me/playlists", {
    method: "POST",
    body: JSON.stringify({
      name: input.name.slice(0, 100) || "Trackhunt playlist",
      description: "Creada desde Trackhunt usando metadatos confirmados por el usuario.",
      public: false,
    }),
  });
  const uniqueUris = [...new Set(found.map((track) => track.uri))];
  for (let index = 0; index < uniqueUris.length; index += 100) {
    await spotifyFetchJson(token, `/playlists/${encodeURIComponent(created.id)}/items`, {
      method: "POST",
      body: JSON.stringify({ uris: uniqueUris.slice(index, index + 100) }),
    });
  }
  return {
    playlist: { id: created.id, name: created.name, url: created.external_urls?.spotify || `https://open.spotify.com/playlist/${created.id}` },
    matched: found.length,
    added: uniqueUris.length,
    missing,
  };
}
