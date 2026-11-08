import { explorationTitle, mediaLink, normalize, originalTitle, tentativeSong, toVersion } from "./remix";
import type { Song, SourceStatus, Version } from "./remix";

export type MusicEnv = { AUDD_API_TOKEN?: string; BRAVE_SEARCH_API_KEY?: string; SOUNDCLOUD_CLIENT_ID?: string; SOUNDCLOUD_CLIENT_SECRET?: string };
type RawResult = { title: string; url: string; description?: string; creator?: string; artwork?: string };
type BatchTrackInput = { clientId?: unknown; id?: unknown; title?: unknown; artist?: unknown };
type BatchTrackStatus = "ok" | "empty" | "partial" | "unavailable" | "not-configured" | "invalid";
type SearchResult = { versions: Version[]; sources: SourceStatus[]; searchedAt: string };
type BatchTrackResult = { clientId: string; index: number; title: string; artist: string; status: BatchTrackStatus; versions: Version[]; sources: SourceStatus[]; searchedAt?: string; error?: string };
type BatchSummary = Record<BatchTrackStatus, number> & { versions: number };
export const MAX_REMIX_BATCH_TRACKS = 10;
const MAX_REMIX_BATCH_CONCURRENCY = 3;
const BRAVE_REQUEST_INTERVAL_MS = 1_050;
const json = (data: unknown, status = 200) => Response.json(data, { status, headers: { "cache-control": "no-store", "x-content-type-options": "nosniff" } });
const catalogCache = new Map<string, { expires: number; songs: Song[] }>();
const searchCache = new Map<string, { expires: number; data: SearchResult }>();
let scToken: { value: string; until: number; client: string } | null = null;
let scTokenPending: { client: string; request: Promise<{ value: string; until: number; client: string }> } | null = null;
let braveQueue = Promise.resolve();
let braveNextRequestAt = 0;
const bounded = (value: unknown, max: number) => typeof value === "string" ? value.trim().slice(0, max) : "";
const delay = (milliseconds: number) => new Promise(resolve => setTimeout(resolve, milliseconds));

async function remoteJson(url: string, init: RequestInit = {}) {
  const response = await fetch(url, { ...init, redirect: "manual", signal: AbortSignal.timeout(15_000) });
  if (!response.ok) throw new Error(response.status === 429 ? "quota" : "provider");
  return response.json();
}
async function catalog(term: string): Promise<Song[]> {
  const cached = catalogCache.get(term);
  if (cached && cached.expires > Date.now()) return cached.songs;
  // Deezer is available without credentials and avoids making identification
  // depend on Apple's regional availability from the hosted worker.
  try {
    const query = term.replace(/\b(?:ft|feat|featuring)\b\.?/gi, " ").replace(/[—–]/g, " ").replace(/\s+/g, " ").trim();
    const endpoint = new URL("https://api.deezer.com/search");
    endpoint.search = new URLSearchParams({ q: query, limit: "12" }).toString();
    const data = await remoteJson(endpoint.toString());
    if (data.error || !Array.isArray(data.data)) throw new Error("provider");
    const seen = new Set<string>();
    const songs: Song[] = [];
    for (const row of data.data) {
      if (typeof row.title !== "string" || typeof row.artist?.name !== "string" || !Number.isSafeInteger(row.id) || row.id <= 0) continue;
      const key = normalize(`${row.artist.name} ${row.title}`);
      if (seen.has(key)) continue;
      seen.add(key);
      songs.push({ title: row.title, artist: row.artist.name, artwork: row.album?.cover_medium, url: `https://www.deezer.com/track/${row.id}`, source: "Catálogo Deezer" });
    }
    if (songs.length) {
      if (catalogCache.size > 150) catalogCache.clear();
      catalogCache.set(term, { expires: Date.now() + 600_000, songs });
      return songs;
    }
  } catch { /* Apple remains a second independent catalog. */ }
  const url = new URL("https://itunes.apple.com/search");
  url.search = new URLSearchParams({ term, entity: "song", limit: "12", country: "US" }).toString();
  const data = await remoteJson(url.toString());
  const seen = new Set<string>();
  const songs: Song[] = [];
  for (const row of data.results ?? []) {
    if (!row.trackName || !row.artistName) continue;
    const key = normalize(`${row.artistName} ${row.trackName}`);
    if (seen.has(key)) continue;
    seen.add(key);
    songs.push({ title: originalTitle(row.trackName), artist: row.artistName, artwork: row.artworkUrl100, url: row.trackViewUrl, source: "Catálogo Apple Music" });
  }
  if (catalogCache.size > 150) catalogCache.clear();
  catalogCache.set(term, { expires: Date.now() + 600_000, songs });
  return songs;
}
async function soundcloud(query: string, env: MusicEnv): Promise<RawResult[]> {
  if (!scToken || scToken.until < Date.now() || scToken.client !== env.SOUNDCLOUD_CLIENT_ID) {
    const client = env.SOUNDCLOUD_CLIENT_ID!;
    if (!scTokenPending || scTokenPending.client !== client) {
      const basic = btoa(`${client}:${env.SOUNDCLOUD_CLIENT_SECRET}`);
      const request = remoteJson("https://secure.soundcloud.com/oauth/token", { method: "POST", headers: { authorization: `Basic ${basic}`, "content-type": "application/x-www-form-urlencoded" }, body: "grant_type=client_credentials" }).then(token => {
        if (!token.access_token) throw new Error("provider");
        return { value: token.access_token as string, client, until: Date.now() + Math.max(0, Number(token.expires_in ?? 3600) - 60) * 1000 };
      });
      scTokenPending = { client, request };
    }
    const pending = scTokenPending;
    try { scToken = await pending.request; } finally { if (scTokenPending === pending) scTokenPending = null; }
  }
  const url = new URL("https://api.soundcloud.com/tracks");
  url.search = new URLSearchParams({ q: query, limit: "50", linked_partitioning: "true", access: "playable,preview,blocked" }).toString();
  const data = await remoteJson(url.toString(), { headers: { authorization: `OAuth ${scToken.value}`, accept: "application/json" } });
  return (Array.isArray(data) ? data : data.collection ?? []).map((row: Record<string, unknown>) => {
    const user = row.user && typeof row.user === "object" ? row.user as Record<string, unknown> : {};
    return { title: String(row.title ?? ""), url: String(row.permalink_url ?? ""), description: String(row.description ?? ""), creator: typeof user.username === "string" ? user.username : undefined, artwork: typeof row.artwork_url === "string" ? row.artwork_url : undefined };
  });
}
async function webIndex(song: Song, domain: string, key: string): Promise<RawResult[]> {
  let release = () => {};
  const previous = braveQueue;
  braveQueue = new Promise<void>(resolve => { release = resolve; });
  await previous;
  try {
    const wait = braveNextRequestAt - Date.now();
    if (wait > 0) await delay(wait);
    const url = new URL("https://api.search.brave.com/res/v1/web/search");
    const title = explorationTitle(song.title).replace(/["()]/g, " ");
    const artist = song.artist.replace(/["()]/g, " ");
    url.search = new URLSearchParams({ q: `site:${domain} "${title}" ${artist} (remix OR edit OR bootleg OR mashup OR extended OR flip OR rework)`, count: "20", result_filter: "web", spellcheck: "false", text_decorations: "false" }).toString();
    const data = await remoteJson(url.toString(), { headers: { accept: "application/json", "X-Subscription-Token": key } });
    return (data.web?.results ?? []).map((row: Record<string, unknown>) => ({ title: String(row.title ?? ""), url: String(row.url ?? ""), description: String(row.description ?? "") }));
  } finally {
    braveNextRequestAt = Date.now() + BRAVE_REQUEST_INTERVAL_MS;
    release();
  }
}
async function findVersions(song: Song, env: MusicEnv): Promise<SearchResult> {
  const configKey = `${Boolean(env.BRAVE_SEARCH_API_KEY)}:${Boolean(env.SOUNDCLOUD_CLIENT_ID && env.SOUNDCLOUD_CLIENT_SECRET)}`;
  const cacheKey = `${configKey}:${normalize(`${song.artist}|${song.title}`)}`;
  const cached = searchCache.get(cacheKey);
  if (cached && cached.expires > Date.now()) return cached.data;
  const baseTitle = explorationTitle(song.title);
  const searchText = `${song.artist} ${baseTitle} remix`;
  const versions: Version[] = [];
  const sources: SourceStatus[] = [];
  // Sequential index calls also respect entry-level search API rate limits.
  for (const name of ["SoundCloud", "Bandcamp"] as const) {
    const searchUrl = name === "SoundCloud" ? `https://soundcloud.com/search/sounds?q=${encodeURIComponent(searchText)}` : `https://bandcamp.com/search?q=${encodeURIComponent(searchText)}&item_type=t`;
    const scConfigured = name === "SoundCloud" && env.SOUNDCLOUD_CLIENT_ID && env.SOUNDCLOUD_CLIENT_SECRET;
    if (!scConfigured && !env.BRAVE_SEARCH_API_KEY) {
      sources.push({ name, status: "not-configured", searchUrl, message: `Búsqueda automática en ${name} pendiente de configuración. Abre el enlace para buscar en ${name}.` });
      continue;
    }
    try {
      const raw = scConfigured ? await soundcloud(`${song.artist} ${baseTitle} remix`, env) : await webIndex(song, name === "SoundCloud" ? "soundcloud.com" : "bandcamp.com", env.BRAVE_SEARCH_API_KEY!);
      const matches = raw.map(row => toVersion(row, song)).filter((row): row is Version => row !== null && row.platform === name);
      versions.push(...matches);
      sources.push({ name, status: matches.length ? "ok" : "empty", searchUrl, message: matches.length ? `${matches.length} coincidencias por título · ${scConfigured ? "API SoundCloud" : "índice web Brave"}` : "Sin versiones coincidentes en esta consulta. No significa que no existan." });
    } catch (error) {
      sources.push({ name, status: "unavailable", searchUrl, message: error instanceof Error && error.message === "quota" ? "El servicio alcanzó su límite. Prueba más tarde o abre la fuente." : "No se pudo consultar esta fuente. Revisa su conexión o abre la búsqueda." });
    }
  }
  const unique = [...new Map(versions.map(row => [row.url, row])).values()].sort((a, b) => Number(b.match === "title-artist") - Number(a.match === "title-artist"));
  const data = { versions: unique, sources, searchedAt: new Date().toISOString() };
  if (sources.some(source => source.status === "ok") && !sources.some(source => source.status === "unavailable")) {
    if (searchCache.size > 100) searchCache.clear();
    searchCache.set(cacheKey, { expires: Date.now() + 300_000, data });
  }
  return data;
}

function batchStatus(result: SearchResult): BatchTrackStatus {
  if (result.versions.length) return result.sources.some(source => source.status === "unavailable") ? "partial" : "ok";
  if (result.sources.every(source => source.status === "not-configured")) return "not-configured";
  if (result.sources.every(source => source.status === "unavailable")) return "unavailable";
  if (result.sources.some(source => source.status === "unavailable")) return "partial";
  return "empty";
}

export async function findVersionsBatch(tracks: BatchTrackInput[], env: MusicEnv) {
  const output: BatchTrackResult[] = new Array(tracks.length);
  let cursor = 0;
  const worker = async () => {
    while (true) {
      const index = cursor++;
      if (index >= tracks.length) return;
      const raw = tracks[index];
      const clientId = bounded(raw?.clientId, 80) || bounded(raw?.id, 80) || `track-${index + 1}`;
      const title = originalTitle(bounded(raw?.title, 200));
      const artist = bounded(raw?.artist, 160);
      if (!title || !artist) {
        output[index] = { clientId, index, title, artist, status: "invalid", versions: [], sources: [], error: "La pista necesita título y artista." };
        continue;
      }
      try {
        const result = await findVersions({ title, artist, source: "Búsqueda por lote" }, env);
        output[index] = { clientId, index, title, artist, status: batchStatus(result), ...result };
      } catch {
        output[index] = { clientId, index, title, artist, status: "unavailable", versions: [], sources: [], error: "No se pudo completar la búsqueda de esta pista." };
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(MAX_REMIX_BATCH_CONCURRENCY, tracks.length) }, worker));
  const summary = output.reduce<BatchSummary>((counts, row) => {
    counts[row.status] += 1;
    counts.versions += row.versions.length;
    return counts;
  }, { ok: 0, empty: 0, partial: 0, unavailable: 0, "not-configured": 0, invalid: 0, versions: 0 });
  return { tracks: output, summary: { requested: tracks.length, ...summary }, limits: { maxTracks: MAX_REMIX_BATCH_TRACKS } };
}

export async function handleMusicRequest(request: Request, env: MusicEnv) {
  const action = new URL(request.url).pathname.split("/").pop();
  if (request.method === "GET" && action === "status") return json({ audioMode: env.AUDD_API_TOKEN && env.AUDD_API_TOKEN !== "test" ? "connected" : "evaluation", webSearch: Boolean(env.BRAVE_SEARCH_API_KEY), soundcloud: Boolean(env.SOUNDCLOUD_CLIENT_ID && env.SOUNDCLOUD_CLIENT_SECRET) });
  if (request.method !== "POST") return json({ error: "Método no permitido." }, 405);
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) return json({ error: "Solicitud no permitida." }, 403);
  const limit = action === "recognize" ? 1_000_000 : 8000;
  if (Number(request.headers.get("content-length") ?? 0) > limit) return json({ error: "El archivo o solicitud supera el tamaño permitido." }, 413);
  try {
    // Bound both streamed and fixed-length bodies before parsing multipart/JSON.
    const reader = request.body?.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    if (reader) while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) { await reader.cancel(); return json({ error: "Solicitud demasiado grande." }, 413); }
      chunks.push(value);
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
    if (action === "recognize") {
      const form = await new Response(bytes, { headers: { "content-type": request.headers.get("content-type") ?? "" } }).formData();
      const file = form.get("file");
      if (!(file instanceof File) || file.size < 1000 || file.size > 900_000) return json({ error: "Selecciona un fragmento WAV válido de hasta 12 segundos." }, 400);
      const header = new Uint8Array(await file.slice(0, 12).arrayBuffer());
      if (String.fromCharCode(...header.slice(0, 4)) !== "RIFF" || String.fromCharCode(...header.slice(8, 12)) !== "WAVE") return json({ error: "El fragmento debe estar en formato WAV." }, 400);
      const outgoing = new FormData();
      outgoing.set("api_token", env.AUDD_API_TOKEN || "test");
      outgoing.set("return", "apple_music,spotify");
      outgoing.set("file", file, "fragment.wav");
      const data = await remoteJson("https://api.audd.io/", { method: "POST", body: outgoing });
      if (data.status !== "success") return json({ error: "El reconocimiento no está disponible o agotó su cuota. Puedes escribir la canción manualmente.", code: "recognition-unavailable" }, 503);
      if (!data.result) return json({ error: "No se reconoció este fragmento. Prueba otra parte de la canción o escribe el título.", code: "not-recognized" }, 422);
      const row = data.result;
      const apple = row.apple_music && typeof row.apple_music === "object" ? row.apple_music : {};
      return json({ song: {
        title: bounded(row.title, 200),
        artist: bounded(row.artist, 160),
        album: bounded(row.album, 200),
        isrc: bounded(row.isrc, 32) || bounded(apple.isrc, 32),
        releaseDate: bounded(row.release_date, 32),
        artwork: bounded(apple.artwork?.url, 1200),
        source: "Reconocimiento de audio · AudD",
      }, note: "Revisa el resultado: los edits y mashups pueden identificarse como su canción original." });
    }
    let body: Record<string, unknown>;
    try { body = JSON.parse(new TextDecoder().decode(bytes)); if (!body || typeof body !== "object") throw new Error(); } catch { return json({ error: "Solicitud inválida." }, 400); }
    if (action === "identify") {
      const value = bounded(body.value, 2000);
      if (value.length < 2) return json({ error: "Escribe una canción o pega un enlace." }, 400);
      if (body.mode === "name") {
        const songs = await catalog(value.slice(0, 200));
        return json({ songs, note: songs.length ? "Elige la canción original. También puedes escribirla manualmente." : "No aparece en este catálogo. Introduce el título y artista manualmente." });
      }
      if (body.mode !== "link") return json({ error: "Tipo de búsqueda inválido." }, 400);
      let link;
      try { link = mediaLink(value); } catch (error) { return json({ error: (error as Error).message }, 400); }
      const endpoint = link.platform === "YouTube" ? "https://www.youtube.com/oembed" : "https://soundcloud.com/oembed";
      const data = await remoteJson(`${endpoint}?format=json&url=${encodeURIComponent(link.url)}`);
      const rawTitle = bounded(data.title, 300);
      const isSet = /\b(live\s?set|dj\s?set|full\s?set|mixset|megamix|playlist)\b/i.test(rawTitle);
      return json({ song: { ...tentativeSong(rawTitle), artwork: data.thumbnail_url, url: link.url, source: `Metadatos de ${link.platform}` }, rawTitle, isSet, note: isSet ? "Este enlace parece un set. Sus metadatos no identifican la canción de un minuto concreto: escribe esa pista o sube un fragmento." : "Esto lee el título del enlace, no reconoce su audio. Confirma o corrige la canción original y elimina el nombre del remixer." });
    }
    if (action === "search") {
      const song: Song = { title: originalTitle(bounded(body.title, 200)), artist: bounded(body.artist, 160), source: "Confirmada por ti" };
      if (!song.title || !song.artist) return json({ error: "Confirma título y artista para buscar versiones de la misma canción." }, 400);
      return json(await findVersions(song, env));
    }
    if (action === "batch-search") {
      if (!Array.isArray(body.tracks) || body.tracks.length < 1) return json({ error: "Incluye al menos una pista para buscar." }, 400);
      if (body.tracks.length > MAX_REMIX_BATCH_TRACKS) return json({ error: `Puedes buscar hasta ${MAX_REMIX_BATCH_TRACKS} pistas por lote.`, maxTracks: MAX_REMIX_BATCH_TRACKS }, 400);
      return json(await findVersionsBatch(body.tracks as BatchTrackInput[], env));
    }
    return json({ error: "Ruta no encontrada." }, 404);
  } catch (error) {
    console.warn("Trackhunt provider failure:", error instanceof Error ? error.message : "unknown");
    return json({ error: action === "identify" ? "No se pudo consultar el catálogo o leer ese enlace. Puedes indicar título y artista manualmente." : "El servicio no respondió. Inténtalo más tarde o continúa por nombre." }, 502);
  }
}
