import { mediaLink, normalize, originalTitle, tentativeSong, toVersion } from "./remix";
import type { Song, SourceStatus, Version } from "./remix";

export type MusicEnv = { AUDD_API_TOKEN?: string; BRAVE_SEARCH_API_KEY?: string; SOUNDCLOUD_CLIENT_ID?: string; SOUNDCLOUD_CLIENT_SECRET?: string };
type RawResult = { title: string; url: string; description?: string; creator?: string; artwork?: string };
const json = (data: unknown, status = 200) => Response.json(data, { status, headers: { "cache-control": "no-store", "x-content-type-options": "nosniff" } });
const catalogCache = new Map<string, { expires: number; songs: Song[] }>();
const searchCache = new Map<string, { expires: number; data: unknown }>();
let scToken: { value: string; until: number; client: string } | null = null;
const bounded = (value: unknown, max: number) => typeof value === "string" ? value.trim().slice(0, max) : "";

async function remoteJson(url: string, init: RequestInit = {}) {
  const response = await fetch(url, { ...init, redirect: "manual", signal: AbortSignal.timeout(15_000) });
  if (!response.ok) throw new Error(response.status === 429 ? "quota" : "provider");
  return response.json();
}
async function catalog(term: string): Promise<Song[]> {
  const cached = catalogCache.get(term);
  if (cached && cached.expires > Date.now()) return cached.songs;
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
    const basic = btoa(`${env.SOUNDCLOUD_CLIENT_ID}:${env.SOUNDCLOUD_CLIENT_SECRET}`);
    const token = await remoteJson("https://secure.soundcloud.com/oauth/token", { method: "POST", headers: { authorization: `Basic ${basic}`, "content-type": "application/x-www-form-urlencoded" }, body: "grant_type=client_credentials" });
    if (!token.access_token) throw new Error("provider");
    scToken = { value: token.access_token, client: env.SOUNDCLOUD_CLIENT_ID!, until: Date.now() + Math.max(0, Number(token.expires_in ?? 3600) - 60) * 1000 };
  }
  const url = new URL("https://api.soundcloud.com/tracks");
  url.search = new URLSearchParams({ q: query, limit: "50", linked_partitioning: "true", access: "playable,preview,blocked" }).toString();
  const data = await remoteJson(url.toString(), { headers: { authorization: `OAuth ${scToken.value}`, accept: "application/json" } });
  return (Array.isArray(data) ? data : data.collection ?? []).map((row: Record<string, any>) => ({ title: String(row.title ?? ""), url: String(row.permalink_url ?? ""), description: String(row.description ?? ""), creator: row.user?.username, artwork: row.artwork_url }));
}
async function webIndex(song: Song, domain: string, key: string): Promise<RawResult[]> {
  const url = new URL("https://api.search.brave.com/res/v1/web/search");
  const title = song.title.replace(/["()]/g, " ");
  const artist = song.artist.replace(/["()]/g, " ");
  url.search = new URLSearchParams({ q: `site:${domain} "${title}" ${artist} (remix OR edit OR bootleg OR mashup OR extended OR flip OR rework)`, count: "20", result_filter: "web", spellcheck: "false", text_decorations: "false" }).toString();
  const data = await remoteJson(url.toString(), { headers: { accept: "application/json", "X-Subscription-Token": key } });
  return (data.web?.results ?? []).map((row: Record<string, unknown>) => ({ title: String(row.title ?? ""), url: String(row.url ?? ""), description: String(row.description ?? "") }));
}
async function findVersions(song: Song, env: MusicEnv) {
  const configKey = `${Boolean(env.BRAVE_SEARCH_API_KEY)}:${Boolean(env.SOUNDCLOUD_CLIENT_ID && env.SOUNDCLOUD_CLIENT_SECRET)}`;
  const cacheKey = `${configKey}:${normalize(`${song.artist}|${song.title}`)}`;
  const cached = searchCache.get(cacheKey);
  if (cached && cached.expires > Date.now()) return cached.data;
  const searchText = `${song.artist} ${song.title} remix`;
  const versions: Version[] = [];
  const sources: SourceStatus[] = [];
  // Sequential index calls also respect entry-level search API rate limits.
  for (const name of ["SoundCloud", "Bandcamp"] as const) {
    const searchUrl = name === "SoundCloud" ? `https://soundcloud.com/search/sounds?q=${encodeURIComponent(searchText)}` : `https://bandcamp.com/search?q=${encodeURIComponent(searchText)}&item_type=t`;
    const scConfigured = name === "SoundCloud" && env.SOUNDCLOUD_CLIENT_ID && env.SOUNDCLOUD_CLIENT_SECRET;
    if (!scConfigured && !env.BRAVE_SEARCH_API_KEY) {
      sources.push({ name, status: "not-configured", searchUrl, message: "Conexión automática pendiente. Puedes abrir la búsqueda en la fuente." });
      continue;
    }
    try {
      const raw = scConfigured ? await soundcloud(`${song.artist} ${song.title}`, env) : await webIndex(song, name === "SoundCloud" ? "soundcloud.com" : "bandcamp.com", env.BRAVE_SEARCH_API_KEY!);
      const matches = raw.map(row => toVersion(row, song)).filter((row): row is Version => row !== null && row.platform === name);
      versions.push(...matches);
      sources.push({ name, status: matches.length ? "ok" : "empty", searchUrl, message: matches.length ? `${matches.length} coincidencias por título · ${scConfigured ? "API SoundCloud" : "índice web Brave"}` : "Sin versiones coincidentes en esta consulta. No significa que no existan." });
    } catch (error) {
      sources.push({ name, status: "unavailable", searchUrl, message: error instanceof Error && error.message === "quota" ? "El servicio alcanzó su límite. Prueba más tarde o abre la fuente." : "No se pudo consultar esta fuente. Revisa su conexión o abre la búsqueda." });
    }
    if (env.BRAVE_SEARCH_API_KEY && !scConfigured && name === "SoundCloud") await new Promise(resolve => setTimeout(resolve, 1050));
  }
  const unique = [...new Map(versions.map(row => [row.url, row])).values()].sort((a, b) => Number(b.match === "title-artist") - Number(a.match === "title-artist"));
  const data = { versions: unique, sources, searchedAt: new Date().toISOString() };
  if (sources.some(source => source.status === "ok") && !sources.some(source => source.status === "unavailable")) {
    if (searchCache.size > 100) searchCache.clear();
    searchCache.set(cacheKey, { expires: Date.now() + 300_000, data });
  }
  return data;
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
      outgoing.set("file", file, "fragment.wav");
      const data = await remoteJson("https://api.audd.io/", { method: "POST", body: outgoing });
      if (data.status !== "success") return json({ error: "El reconocimiento no está disponible o agotó su cuota. Puedes escribir la canción manualmente.", code: "recognition-unavailable" }, 503);
      if (!data.result) return json({ error: "No se reconoció este fragmento. Prueba otra parte de la canción o escribe el título.", code: "not-recognized" }, 422);
      const row = data.result;
      return json({ song: { title: bounded(row.title, 200), artist: bounded(row.artist, 160), source: "Reconocimiento de audio · AudD" }, note: "Revisa el resultado: los edits y mashups pueden identificarse como su canción original." });
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
    return json({ error: "Ruta no encontrada." }, 404);
  } catch (error) {
    console.warn("Trackhunt provider failure:", error instanceof Error ? error.message : "unknown");
    return json({ error: action === "identify" ? "No se pudo consultar el catálogo o leer ese enlace. Puedes indicar título y artista manualmente." : "El servicio no respondió. Inténtalo más tarde o continúa por nombre." }, 502);
  }
}
