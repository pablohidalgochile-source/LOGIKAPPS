import { mediaLink, tentativeSong } from "./remix";
import {
  buildStoreSearches,
  identityScore,
  matchLabel,
  normalizeQualityText,
  safeQualityUrl,
  type QualityCandidate,
  type QualityIdentity,
  type QualitySourceStatus,
} from "./quality";

export type QualityEnv = { BRAVE_SEARCH_API_KEY?: string };

const cache = new Map<string, { expires: number; data: unknown }>();
const searchWindows = new Map<string, { until: number; count: number }>();
const responseJson = (data: unknown, status = 200) => Response.json(data, {
  status,
  headers: { "cache-control": "no-store", "x-content-type-options": "nosniff" },
});
const bounded = (value: unknown, max: number) => typeof value === "string" ? value.trim().slice(0, max) : "";

async function remoteJson(url: string, init: RequestInit = {}) {
  const response = await fetch(url, { ...init, redirect: "manual", signal: AbortSignal.timeout(16_000) });
  if (!response.ok) throw new Error(response.status === 429 ? "quota" : "provider");
  return response.json();
}

function evidence(score: number, album?: string) {
  const messages = [score >= 0.88 ? "Título, versión y artista coinciden estrechamente por texto." : score >= 0.68 ? "Coincidencia textual probable; revisa duración, sello y año." : "Coincidencia textual parcial; requiere revisión manual."];
  if (album) messages.push(`Publicación: ${album}.`);
  return messages;
}

async function appleCandidates(identity: QualityIdentity): Promise<QualityCandidate[]> {
  const url = new URL("https://itunes.apple.com/search");
  url.search = new URLSearchParams({ term: `${identity.artist} ${identity.title} ${identity.version ?? ""}`.trim(), entity: "song", limit: "25", country: "CL" }).toString();
  const data = await remoteJson(url.toString());
  return (data.results ?? []).flatMap((row: Record<string, unknown>) => {
    const title = bounded(row.trackName, 240);
    const artist = bounded(row.artistName, 180);
    const album = bounded(row.collectionName, 240);
    const target = safeQualityUrl(bounded(row.trackViewUrl, 1200));
    if (!title || !artist || !target) return [];
    const score = identityScore(identity, { title, artist });
    if (score < 0.42) return [];
    const artwork = bounded(row.artworkUrl100, 1200).replace(/100x100bb/, "300x300bb");
    return [{
      id: `apple:${String(row.trackId ?? "").slice(0, 80) || target}`,
      provider: "Apple Music" as const,
      title,
      artist,
      album,
      url: target,
      artwork: safeQualityUrl(artwork) ?? undefined,
      match: matchLabel(score),
      identityScore: score,
      evidence: evidence(score, album),
      qualityNote: "Referencia oficial de catálogo. Confirma en la ficha si está disponible para compra o solo reproducción.",
    }];
  }).sort((a: QualityCandidate, b: QualityCandidate) => b.identityScore - a.identityScore).slice(0, 6);
}

async function deezerCandidates(identity: QualityIdentity): Promise<QualityCandidate[]> {
  const url = new URL("https://api.deezer.com/search");
  url.searchParams.set("q", `${identity.artist} ${identity.title} ${identity.version ?? ""}`.trim());
  url.searchParams.set("limit", "25");
  const data = await remoteJson(url.toString());
  return (data.data ?? []).flatMap((row: { id?: string | number; title?: string; title_version?: string; link?: string; artist?: { name?: string }; album?: { title?: string; cover_medium?: string } }) => {
    const title = bounded(row.title, 240);
    const artist = bounded(row.artist?.name, 180);
    const version = bounded(row.title_version, 120);
    const album = bounded(row.album?.title, 240);
    const target = safeQualityUrl(bounded(row.link, 1200));
    if (!title || !artist || !target) return [];
    const score = identityScore(identity, { title, artist, version });
    if (score < 0.42) return [];
    return [{
      id: `deezer:${String(row.id ?? "").slice(0, 80) || target}`,
      provider: "Deezer" as const,
      title,
      artist,
      version,
      album,
      url: target,
      artwork: safeQualityUrl(bounded(row.album?.cover_medium, 1200)) ?? undefined,
      match: matchLabel(score),
      identityScore: score,
      evidence: evidence(score, album),
      qualityNote: "Referencia de catálogo. No demuestra la calidad ni habilita la descarga del audio.",
    }];
  }).sort((a: QualityCandidate, b: QualityCandidate) => b.identityScore - a.identityScore).slice(0, 6);
}

function webSource(url: string) {
  const host = new URL(url).hostname.replace(/^www\./, "");
  if (host.endsWith("beatport.com")) return "Beatport";
  if (host.endsWith("bandcamp.com")) return "Bandcamp";
  if (host.endsWith("traxsource.com")) return "Traxsource";
  if (host.endsWith("junodownload.com")) return "Juno Download";
  if (host.endsWith("qobuz.com")) return "Qobuz";
  if (host.endsWith("soundcloud.com")) return "SoundCloud";
  return host;
}

async function webCandidates(identity: QualityIdentity, key: string): Promise<QualityCandidate[]> {
  const query = `${identity.artist} "${identity.title}" ${identity.version ?? ""} (site:beatport.com OR site:bandcamp.com OR site:traxsource.com OR site:junodownload.com OR site:qobuz.com)`;
  const url = new URL("https://api.search.brave.com/res/v1/web/search");
  url.search = new URLSearchParams({ q: query, count: "20", result_filter: "web", spellcheck: "false", text_decorations: "false" }).toString();
  const data = await remoteJson(url.toString(), { headers: { accept: "application/json", "X-Subscription-Token": key } });
  return (data.web?.results ?? []).flatMap((row: Record<string, unknown>, index: number) => {
    const target = safeQualityUrl(bounded(row.url, 1200));
    const title = bounded(row.title, 260);
    const description = bounded(row.description, 500);
    if (!target || !title) return [];
    const evidenceText = normalizeQualityText(`${title} ${description}`);
    const artistWords = normalizeQualityText(identity.artist).split(" ").filter(Boolean);
    const evidencedArtist = artistWords.length > 0 && artistWords.every((word) => evidenceText.split(" ").includes(word)) ? identity.artist : "";
    const score = identityScore(identity, { title, artist: evidencedArtist });
    if (score < 0.42) return [];
    const sourceName = webSource(target);
    return [{
      id: `web:${index}:${target}`,
      provider: "Web" as const,
      sourceName,
      title,
      artist: identity.artist,
      url: target,
      match: matchLabel(score),
      identityScore: score,
      evidence: [score >= 0.68 ? "El resultado menciona la versión buscada." : "El resultado necesita comprobación manual.", description].filter(Boolean),
      qualityNote: "Resultado encontrado en la web. Abre la fuente y confirma formato, duración, sello y procedencia.",
    }];
  }).sort((a: QualityCandidate, b: QualityCandidate) => b.identityScore - a.identityScore).slice(0, 10);
}

async function readJson(request: Request) {
  const limit = 10_000;
  if (Number(request.headers.get("content-length") ?? 0) > limit) throw new Error("too-large");
  const reader = request.body?.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  if (reader) while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > limit) { await reader.cancel(); throw new Error("too-large"); }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  try { return JSON.parse(new TextDecoder().decode(bytes)) as Record<string, unknown>; }
  catch { throw new Error("invalid-json"); }
}

async function searchQuality(identity: QualityIdentity, env: QualityEnv) {
  const key = `${identity.artist}|${identity.title}|${identity.version ?? ""}|${identity.album ?? ""}|${identity.isrc ?? ""}|${Boolean(env.BRAVE_SEARCH_API_KEY)}`.toLowerCase();
  const cached = cache.get(key);
  if (cached && cached.expires > Date.now()) return { ...(cached.data as Record<string, unknown>), identity };
  const statuses: QualitySourceStatus[] = [];
  const [apple, deezer] = await Promise.allSettled([appleCandidates(identity), deezerCandidates(identity)]);
  const candidates: QualityCandidate[] = [];
  if (apple.status === "fulfilled") { candidates.push(...apple.value); statuses.push({ name: "Apple Music", status: apple.value.length ? "ok" : "empty", message: apple.value.length ? `${apple.value.length} coincidencias de catálogo.` : "Sin coincidencias suficientemente cercanas." }); }
  else statuses.push({ name: "Apple Music", status: "unavailable", message: "El catálogo no respondió. Las búsquedas directas siguen disponibles." });
  if (deezer.status === "fulfilled") { candidates.push(...deezer.value); statuses.push({ name: "Deezer", status: deezer.value.length ? "ok" : "empty", message: deezer.value.length ? `${deezer.value.length} coincidencias de catálogo.` : "Sin coincidencias suficientemente cercanas." }); }
  else statuses.push({ name: "Deezer", status: "unavailable", message: "El catálogo no respondió. Las búsquedas directas siguen disponibles." });
  if (env.BRAVE_SEARCH_API_KEY) {
    try {
      const web = await webCandidates(identity, env.BRAVE_SEARCH_API_KEY);
      candidates.push(...web);
      statuses.push({ name: "Tiendas en la web", status: web.length ? "ok" : "empty", message: web.length ? `${web.length} páginas candidatas para revisar.` : "No aparecieron páginas suficientemente cercanas." });
    } catch (error) {
      statuses.push({ name: "Tiendas en la web", status: "unavailable", message: error instanceof Error && error.message === "quota" ? "La búsqueda alcanzó su cuota temporal." : "La búsqueda automática no respondió." });
    }
  } else {
    statuses.push({ name: "Tiendas en la web", status: "not-configured", message: "Búsqueda automática pendiente; los enlaces directos de cada tienda ya están disponibles." });
  }
  const unique = [...new Map(candidates.map((candidate) => [candidate.url, candidate])).values()]
    .sort((a, b) => b.identityScore - a.identityScore);
  const data = { identity, candidates: unique, stores: buildStoreSearches(identity), sources: statuses, searchedAt: new Date().toISOString() };
  if (cache.size > 100) cache.clear();
  cache.set(key, { expires: Date.now() + 300_000, data });
  return data;
}

function allowSearch(request: Request) {
  const id = request.headers.get("oai-authenticated-user-id") || request.headers.get("cf-connecting-ip") || "anonymous";
  const now = Date.now();
  const current = searchWindows.get(id);
  if (!current || current.until <= now) {
    if (searchWindows.size > 500) searchWindows.clear();
    searchWindows.set(id, { until: now + 10 * 60_000, count: 1 });
    return true;
  }
  current.count += 1;
  return current.count <= 30;
}

export async function handleQualityRequest(request: Request, env: QualityEnv) {
  const action = new URL(request.url).pathname.split("/").pop();
  if (request.method === "GET" && action === "status") return responseJson({ publicCatalogs: true, webSearch: Boolean(env.BRAVE_SEARCH_API_KEY) });
  if (request.method !== "POST") return responseJson({ error: "Método no permitido." }, 405);
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) return responseJson({ error: "Solicitud no permitida." }, 403);
  let body: Record<string, unknown>;
  try { body = await readJson(request); }
  catch (error) { return responseJson({ error: error instanceof Error && error.message === "too-large" ? "Solicitud demasiado grande." : "Solicitud inválida." }, error instanceof Error && error.message === "too-large" ? 413 : 400); }
  try {
    if (action === "identify") {
      const raw = bounded(body.url, 2000);
      let link;
      try { link = mediaLink(raw); } catch (error) { return responseJson({ error: (error as Error).message }, 400); }
      const endpoint = link.platform === "YouTube" ? "https://www.youtube.com/oembed" : "https://soundcloud.com/oembed";
      const data = await remoteJson(`${endpoint}?format=json&url=${encodeURIComponent(link.url)}`);
      const rawTitle = bounded(data.title, 300);
      if (/\b(live\s?set|dj\s?set|full\s?set|mixset|megamix|playlist)\b/i.test(rawTitle)) return responseJson({ error: "Este enlace parece un set o mix largo. Analízalo desde la herramienta de Sets." }, 422);
      return responseJson({ identity: { ...tentativeSong(rawTitle), source: `Metadatos de ${link.platform}` }, note: "Confirma la versión exacta antes de buscar una fuente mejor." });
    }
    if (action === "search") {
      if (!allowSearch(request)) return responseJson({ error: "Has realizado muchas búsquedas seguidas. Espera unos minutos para proteger las fuentes externas." }, 429);
      const identity: QualityIdentity = {
        title: bounded(body.title, 220),
        artist: bounded(body.artist, 180),
        version: bounded(body.version, 160),
        album: bounded(body.album, 220),
        isrc: bounded(body.isrc, 32),
        source: bounded(body.source, 120) || "Confirmada por ti",
      };
      if (!identity.title || !identity.artist) return responseJson({ error: "Confirma el título y el artista." }, 400);
      return responseJson(await searchQuality(identity, env));
    }
    return responseJson({ error: "Ruta no encontrada." }, 404);
  } catch {
    return responseJson({ error: "Una fuente externa no respondió. Puedes continuar con las búsquedas directas." }, 502);
  }
}
