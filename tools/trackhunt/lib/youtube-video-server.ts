import { orientDescriptionTracks, trackFromPlaylistMetadata, tracksFromDescription, uniqueTracks } from "./video-tracklist";
import type { TrackReference } from "./video-tracklist";

type JsonObject = Record<string, unknown>;

export type YoutubeVideoMetadata = {
  title: string;
  channel: string;
  thumbnail: string;
};

export type YoutubeVideoAnalysis = YoutubeVideoMetadata & {
  source: "youtube-credits" | "youtube-description" | "youtube-data-api" | "youtube-playlist-api";
  tracks: TrackReference[];
  coverage?: {
    status: "complete" | "partial";
    reason?: "youtube-public-credits";
    message?: string;
  };
};

type YoutubeEnvironment = {
  YOUTUBE_API_KEY?: string;
};

type YoutubeOptions = {
  fetchImpl?: typeof fetch;
  retryDelayMs?: number;
  overallTimeoutMs?: number;
  now?: () => number;
};

type ExtractedVideo = {
  analysis?: YoutubeVideoAnalysis;
  metadata?: YoutubeVideoMetadata;
};

type CachedAnalysis = {
  expiresAt: number;
  value: YoutubeVideoAnalysis;
};

const CACHE_TTL_MS = 30 * 60 * 1000;
const MAX_CACHE_ENTRIES = 80;
const MAX_PLAYLIST_ITEMS = 500;
const analysisCache = new Map<string, CachedAnalysis>();

class YoutubeTransportError extends Error {
  status?: number;
  timedOut: boolean;

  constructor(message: string, status?: number, timedOut = false) {
    super(message);
    this.name = "YoutubeTransportError";
    this.status = status;
    this.timedOut = timedOut;
  }
}

export class YoutubeAnalysisError extends Error {
  code: string;
  status: number;
  retryable: boolean;
  canPaste: boolean;
  metadata?: YoutubeVideoMetadata;

  constructor(input: {
    message: string;
    code: string;
    status: number;
    retryable?: boolean;
    canPaste?: boolean;
    metadata?: YoutubeVideoMetadata;
  }) {
    super(input.message);
    this.name = "YoutubeAnalysisError";
    this.code = input.code;
    this.status = input.status;
    this.retryable = Boolean(input.retryable);
    this.canPaste = input.canPaste !== false;
    this.metadata = input.metadata;
  }
}

export function resetYoutubeAnalysisCache() {
  analysisCache.clear();
}

function youtubeUrl(rawUrl: string) {
  try {
    const url = new URL(rawUrl);
    const host = url.hostname.replace(/^www\./, "");
    if (!["youtu.be", "youtube.com", "m.youtube.com", "music.youtube.com"].includes(host)) return null;
    return { url, host };
  } catch {
    return null;
  }
}

export function youtubeVideoId(rawUrl: string) {
  const parsed = youtubeUrl(rawUrl);
  if (!parsed) return null;
  const { url, host } = parsed;
  if (host === "youtu.be") return url.pathname.split("/").filter(Boolean)[0] ?? null;
  if (url.pathname === "/watch") return url.searchParams.get("v");
  const parts = url.pathname.split("/").filter(Boolean);
  if (["shorts", "embed", "live"].includes(parts[0])) return parts[1] ?? null;
  return null;
}

export function youtubePlaylistId(rawUrl: string) {
  const parsed = youtubeUrl(rawUrl);
  if (!parsed || !parsed.url.searchParams.has("list")) return null;
  const playlistId = parsed.url.searchParams.get("list")?.trim() ?? "";
  return /^[A-Za-z0-9_-]{2,150}$/.test(playlistId) ? playlistId : null;
}

function hasYoutubePlaylistParameter(rawUrl: string) {
  return Boolean(youtubeUrl(rawUrl)?.url.searchParams.has("list"));
}

function isAutomaticRadioVideoUrl(rawUrl: string) {
  const parsed = youtubeUrl(rawUrl);
  if (!parsed || parsed.url.pathname !== "/watch") return false;
  const videoId = youtubeVideoId(rawUrl);
  const playlistId = youtubePlaylistId(rawUrl);
  return Boolean(videoId && /^[\w-]{11}$/.test(videoId) && playlistId && /^RD/i.test(playlistId));
}

function readText(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (!value || typeof value !== "object") return "";
  const object = value as JsonObject;
  if (typeof object.simpleText === "string") return object.simpleText;
  if (Array.isArray(object.runs)) {
    return object.runs
      .map((run) => typeof run === "object" && run && typeof (run as JsonObject).text === "string" ? (run as JsonObject).text : "")
      .join("")
      .trim();
  }
  return "";
}

function collectMusicCredits(value: unknown, insideMusicSection = false, output: TrackReference[] = []) {
  if (!value || typeof value !== "object") return output;
  if (Array.isArray(value)) {
    value.forEach((item) => collectMusicCredits(item, insideMusicSection, output));
    return output;
  }

  const object = value as JsonObject;
  let musicSection = insideMusicSection;
  const section = object.horizontalCardListRenderer as JsonObject | undefined;
  if (section) {
    const header = section.header as JsonObject | undefined;
    const richHeader = header?.richListHeaderRenderer as JsonObject | undefined;
    const sectionTitle = readText(richHeader?.title ?? header);
    musicSection = /music|música|musique|musik/i.test(sectionTitle);
  }

  const attribute = object.videoAttributeViewModel as JsonObject | undefined;
  if (attribute && musicSection) {
    const title = readText(attribute.title);
    const artist = readText(attribute.subtitle)
      .replace(/\s*[·•]\s*(?:song|canción|music|música).*$/i, "")
      .trim();
    if (title && artist) output.push({ time: "--:--", seconds: 0, artist, title });
  }

  Object.values(object).forEach((item) => collectMusicCredits(item, musicSection, output));
  return output;
}

function jsonAfterMarker(source: string, markers: string[]) {
  for (const marker of markers) {
    const markerIndex = source.indexOf(marker);
    if (markerIndex < 0) continue;
    const start = source.indexOf("{", markerIndex + marker.length);
    if (start < 0) continue;
    let depth = 0;
    let quoted = false;
    let escaped = false;
    for (let index = start; index < source.length; index += 1) {
      const char = source[index];
      if (quoted) {
        if (escaped) escaped = false;
        else if (char === "\\") escaped = true;
        else if (char === '"') quoted = false;
        continue;
      }
      if (char === '"') quoted = true;
      else if (char === "{") depth += 1;
      else if (char === "}") {
        depth -= 1;
        if (depth === 0) {
          try {
            return JSON.parse(source.slice(start, index + 1)) as JsonObject;
          } catch {
            break;
          }
        }
      }
    }
  }
  return null;
}

function bestThumbnail(value: unknown, fallback: string) {
  if (!value || typeof value !== "object") return fallback;
  const object = value as JsonObject;
  for (const key of ["maxres", "standard", "high", "medium", "default"]) {
    const candidate = object[key];
    if (candidate && typeof candidate === "object" && typeof (candidate as JsonObject).url === "string") {
      return String((candidate as JsonObject).url);
    }
  }
  if (Array.isArray(value)) {
    const candidate = [...value].reverse().find((item) => item && typeof item === "object" && typeof (item as JsonObject).url === "string");
    if (candidate && typeof candidate === "object") return String((candidate as JsonObject).url);
  }
  return fallback;
}

function wait(milliseconds: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, milliseconds));
}

async function fetchWithRetry<T>(
  fetchImpl: typeof fetch,
  url: string,
  init: RequestInit,
  readBody: (response: Response) => Promise<T>,
  retryDelayMs: number,
  timeoutMs: number,
  deadlineAt: number,
) {
  let lastError: unknown;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const remaining = deadlineAt - Date.now();
    if (remaining <= 0) throw new YoutubeTransportError("La consulta a YouTube agotó el tiempo disponible.", undefined, true);
    try {
      const response = await fetchImpl(url, { ...init, signal: AbortSignal.timeout(Math.max(1, Math.min(timeoutMs, remaining))) });
      const temporary = response.status === 429 || response.status >= 500;
      if (temporary && attempt === 0) {
        await wait(Math.min(retryDelayMs, Math.max(0, deadlineAt - Date.now())));
        continue;
      }
      if (!response.ok) return { response, body: undefined };
      const body = await readBody(response);
      return { response, body };
    } catch (error) {
      lastError = error;
      if (attempt === 1) break;
      await wait(Math.min(retryDelayMs, Math.max(0, deadlineAt - Date.now())));
    }
  }
  const errorName = lastError && typeof lastError === "object" && "name" in lastError ? String(lastError.name) : "";
  throw new YoutubeTransportError(
    lastError instanceof Error ? lastError.message : "YouTube no respondió.",
    undefined,
    errorName === "AbortError" || errorName === "TimeoutError" || Date.now() >= deadlineAt,
  );
}

async function readOembed(id: string, fetchImpl: typeof fetch) {
  const canonical = `https://www.youtube.com/watch?v=${id}`;
  try {
    const response = await fetchImpl(`https://www.youtube.com/oembed?url=${encodeURIComponent(canonical)}&format=json`, {
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(8_000),
    });
    if (!response.ok) return { status: response.status };
    const payload = await response.json() as JsonObject;
    const metadata: YoutubeVideoMetadata = {
      title: typeof payload.title === "string" ? payload.title : "Set de YouTube",
      channel: typeof payload.author_name === "string" ? payload.author_name : "YouTube",
      thumbnail: typeof payload.thumbnail_url === "string" ? payload.thumbnail_url : `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
    };
    return { status: response.status, metadata };
  } catch {
    return { status: 0 };
  }
}

async function readOfficialApi(id: string, apiKey: string, fetchImpl: typeof fetch, retryDelayMs: number, deadlineAt: number): Promise<ExtractedVideo> {
  const params = new URLSearchParams({
    part: "snippet,status",
    id,
    fields: "items(snippet(title,channelTitle,description,thumbnails),status(privacyStatus,uploadStatus))",
  });
  const result = await fetchWithRetry(fetchImpl, `https://www.googleapis.com/youtube/v3/videos?${params}`, {
    headers: { accept: "application/json", "X-goog-api-key": apiKey },
  }, (response) => response.json() as Promise<JsonObject>, retryDelayMs, 8_000, deadlineAt);
  const { response, body: payload } = result;
  if (!response.ok) throw new YoutubeTransportError("La API oficial de YouTube no respondió.", response.status);
  if (!payload) throw new YoutubeTransportError("La API oficial de YouTube devolvió una respuesta vacía.");
  const item = Array.isArray(payload.items) && payload.items[0] && typeof payload.items[0] === "object"
    ? payload.items[0] as JsonObject
    : null;
  if (!item) throw new YoutubeTransportError("El video no existe o no es público.", 404);

  const snippet = item.snippet as JsonObject | undefined;
  const status = item.status as JsonObject | undefined;
  if (status?.privacyStatus === "private" || ["deleted", "failed", "rejected"].includes(String(status?.uploadStatus ?? ""))) {
    throw new YoutubeAnalysisError({
      code: "VIDEO_RESTRICTED",
      message: "El video es privado, fue eliminado o no está disponible públicamente.",
      status: 422,
    });
  }

  const metadata: YoutubeVideoMetadata = {
    title: typeof snippet?.title === "string" ? snippet.title : "Set de YouTube",
    channel: typeof snippet?.channelTitle === "string" ? snippet.channelTitle : "YouTube",
    thumbnail: bestThumbnail(snippet?.thumbnails, `https://i.ytimg.com/vi/${id}/hqdefault.jpg`),
  };
  const description = typeof snippet?.description === "string" ? snippet.description : "";
  const tracks = uniqueTracks(orientDescriptionTracks(tracksFromDescription(description), []), []);
  return tracks.length ? { analysis: { ...metadata, source: "youtube-data-api", tracks }, metadata } : { metadata };
}

async function readOfficialPlaylist(
  playlistId: string,
  apiKey: string,
  fetchImpl: typeof fetch,
  retryDelayMs: number,
  deadlineAt: number,
): Promise<YoutubeVideoAnalysis> {
  const playlistParams = new URLSearchParams({
    part: "snippet,status,contentDetails",
    id: playlistId,
    fields: "items(snippet(title,channelTitle,thumbnails),status(privacyStatus),contentDetails(itemCount))",
  });
  const playlistResult = await fetchWithRetry(fetchImpl, `https://www.googleapis.com/youtube/v3/playlists?${playlistParams}`, {
    headers: { accept: "application/json", "X-goog-api-key": apiKey },
  }, (response) => response.json() as Promise<JsonObject>, retryDelayMs, 8_000, deadlineAt);
  if (!playlistResult.response.ok) {
    throw new YoutubeTransportError("La API oficial no pudo abrir la playlist.", playlistResult.response.status);
  }

  const playlistItem = playlistResult.body && Array.isArray(playlistResult.body.items) && playlistResult.body.items[0] && typeof playlistResult.body.items[0] === "object"
    ? playlistResult.body.items[0] as JsonObject
    : null;
  if (!playlistItem) {
    const automatic = /^RD/i.test(playlistId);
    throw new YoutubeAnalysisError({
      code: "YOUTUBE_PLAYLIST_NOT_ACCESSIBLE",
      message: automatic
        ? "Esta radio automática de YouTube no publica sus elementos mediante la API. Abre el video individual o usa una playlist pública normal."
        : "YouTube no encontró esta playlist o no permite leerla públicamente. Revisa que exista y sea pública.",
      status: 404,
    });
  }

  const playlistSnippet = playlistItem.snippet as JsonObject | undefined;
  const playlistStatus = playlistItem.status as JsonObject | undefined;
  if (playlistStatus?.privacyStatus === "private") {
    throw new YoutubeAnalysisError({
      code: "YOUTUBE_PLAYLIST_NOT_ACCESSIBLE",
      message: "La playlist es privada. Cámbiala a pública o pega/exporta su lista de canciones.",
      status: 422,
    });
  }

  const contentDetails = playlistItem.contentDetails as JsonObject | undefined;
  const publishedCount = Number(contentDetails?.itemCount ?? 0);
  if (Number.isFinite(publishedCount) && publishedCount > MAX_PLAYLIST_ITEMS) {
    throw new YoutubeAnalysisError({
      code: "YOUTUBE_PLAYLIST_TOO_LARGE",
      message: `La playlist contiene ${publishedCount} videos. El límite por análisis es ${MAX_PLAYLIST_ITEMS}; divídela en listas más pequeñas.`,
      status: 422,
    });
  }

  const metadata: YoutubeVideoMetadata = {
    title: typeof playlistSnippet?.title === "string" ? playlistSnippet.title.trim().slice(0, 300) : "Playlist de YouTube",
    channel: typeof playlistSnippet?.channelTitle === "string" ? playlistSnippet.channelTitle.trim().slice(0, 180) : "YouTube",
    thumbnail: bestThumbnail(playlistSnippet?.thumbnails, ""),
  };
  const tracks: TrackReference[] = [];
  const seenPageTokens = new Set<string>();
  let inspectedItems = 0;
  let pageToken = "";

  do {
    const itemParams = new URLSearchParams({
      part: "snippet,status,contentDetails",
      playlistId,
      maxResults: "50",
      fields: "nextPageToken,items(snippet(position,title,videoOwnerChannelTitle,resourceId(videoId)),status(privacyStatus),contentDetails(videoId))",
    });
    if (pageToken) itemParams.set("pageToken", pageToken);
    const pageResult = await fetchWithRetry(fetchImpl, `https://www.googleapis.com/youtube/v3/playlistItems?${itemParams}`, {
      headers: { accept: "application/json", "X-goog-api-key": apiKey },
    }, (response) => response.json() as Promise<JsonObject>, retryDelayMs, 8_000, deadlineAt);
    if (!pageResult.response.ok) {
      throw new YoutubeTransportError("La API oficial no pudo enumerar la playlist.", pageResult.response.status);
    }
    if (!pageResult.body) throw new YoutubeTransportError("La API oficial devolvió una playlist vacía.");

    const items = Array.isArray(pageResult.body.items) ? pageResult.body.items : [];
    for (const rawItem of items) {
      inspectedItems += 1;
      if (inspectedItems > MAX_PLAYLIST_ITEMS) {
        throw new YoutubeAnalysisError({
          code: "YOUTUBE_PLAYLIST_TOO_LARGE",
          message: `La playlist supera el límite de ${MAX_PLAYLIST_ITEMS} videos por análisis. Divídela en listas más pequeñas.`,
          status: 422,
        });
      }
      if (!rawItem || typeof rawItem !== "object") continue;
      const item = rawItem as JsonObject;
      const status = item.status as JsonObject | undefined;
      if (status?.privacyStatus === "private") continue;
      const snippet = item.snippet as JsonObject | undefined;
      const title = typeof snippet?.title === "string" ? snippet.title : "";
      const track = trackFromPlaylistMetadata({
        title,
        ownerChannel: typeof snippet?.videoOwnerChannelTitle === "string" ? snippet.videoOwnerChannelTitle : "",
      });
      if (track) tracks.push(track);
    }

    const nextPageToken = typeof pageResult.body.nextPageToken === "string" ? pageResult.body.nextPageToken : "";
    if (!nextPageToken) break;
    if (seenPageTokens.has(nextPageToken)) throw new YoutubeTransportError("YouTube devolvió una paginación inválida para la playlist.");
    seenPageTokens.add(nextPageToken);
    pageToken = nextPageToken;
  } while (pageToken);

  if (!tracks.length) {
    throw new YoutubeAnalysisError({
      code: inspectedItems || publishedCount ? "YOUTUBE_PLAYLIST_NO_PUBLIC_ITEMS" : "YOUTUBE_PLAYLIST_EMPTY",
      message: inspectedItems || publishedCount
        ? "La playlist no contiene videos públicos que se puedan convertir en canciones."
        : "La playlist está vacía.",
      status: 422,
      metadata,
    });
  }

  return { ...metadata, source: "youtube-playlist-api", tracks };
}

async function readWatchPage(id: string, fetchImpl: typeof fetch, retryDelayMs: number, deadlineAt: number): Promise<ExtractedVideo> {
  const result = await fetchWithRetry(fetchImpl, `https://www.youtube.com/watch?v=${id}&hl=es`, {
    headers: {
      accept: "text/html,application/xhtml+xml",
      "accept-language": "es-ES,es;q=0.9,en;q=0.8",
      "user-agent": "Mozilla/5.0 (compatible; Trackhunt/1.0; +https://trackhunt-dj.nanook.chatgpt.site)",
    },
  }, (response) => response.text(), retryDelayMs, 10_000, deadlineAt);
  const { response, body: html } = result;
  if (!response.ok) throw new YoutubeTransportError(`YouTube respondió con HTTP ${response.status}.`, response.status);
  if (typeof html !== "string") throw new YoutubeTransportError("YouTube devolvió una respuesta vacía.");
  const player = jsonAfterMarker(html, ["var ytInitialPlayerResponse =", "ytInitialPlayerResponse =", 'ytInitialPlayerResponse":']);
  const initial = jsonAfterMarker(html, ["var ytInitialData =", "window[\"ytInitialData\"] =", 'ytInitialData":']);
  if (!player) {
    throw new YoutubeAnalysisError({
      code: "YOUTUBE_FORMAT_CHANGED",
      message: "YouTube entregó una página que no contiene datos públicos legibles. Puedes reintentar o pegar la tracklist.",
      status: 503,
    });
  }

  const playability = player.playabilityStatus as JsonObject | undefined;
  const playabilityStatus = String(playability?.status ?? "OK");
  const details = player.videoDetails as JsonObject | undefined;
  const metadata: YoutubeVideoMetadata = {
    title: typeof details?.title === "string" ? details.title : "Set de YouTube",
    channel: typeof details?.author === "string" ? details.author : "YouTube",
    thumbnail: bestThumbnail((details?.thumbnail as JsonObject | undefined)?.thumbnails, `https://i.ytimg.com/vi/${id}/hqdefault.jpg`),
  };
  const description = typeof details?.shortDescription === "string" ? details.shortDescription : "";
  const rawDescriptionTracks = tracksFromDescription(description);
  const creditTracks = collectMusicCredits(initial);
  const descriptionTracks = orientDescriptionTracks(rawDescriptionTracks, creditTracks);
  const tracks = uniqueTracks(descriptionTracks, creditTracks);
  if (tracks.length) {
    return {
      analysis: {
        ...metadata,
        source: descriptionTracks.length ? "youtube-description" : "youtube-credits",
        tracks,
        ...(descriptionTracks.length ? {} : {
          coverage: {
            status: "partial" as const,
            reason: "youtube-public-credits" as const,
            message: `YouTube solo publicó ${creditTracks.length} ${creditTracks.length === 1 ? "crédito musical" : "créditos musicales"}. Pueden ser una parte del mix, no la tracklist completa.`,
          },
        }),
      },
      metadata,
    };
  }

  // YouTube sometimes marks playback as login-required while still publishing
  // a readable music-credit panel. Those public credits are useful to Trackhunt
  // even though the server never attempts to play or download the video.
  if (playabilityStatus !== "OK") {
    const reason = readText(playability?.reason) || "El video no está disponible públicamente.";
    const notFound = playabilityStatus === "ERROR" && /removed|not available|unavailable|eliminad|no disponible/i.test(reason);
    throw new YoutubeAnalysisError({
      code: notFound ? "VIDEO_NOT_FOUND" : "VIDEO_RESTRICTED",
      message: reason,
      status: notFound ? 404 : 422,
    });
  }

  return { metadata };
}

function cacheAnalysis(cacheKey: string, value: YoutubeVideoAnalysis, now: number) {
  if (analysisCache.size >= MAX_CACHE_ENTRIES) {
    const oldest = analysisCache.keys().next().value as string | undefined;
    if (oldest) analysisCache.delete(oldest);
  }
  analysisCache.set(cacheKey, { expiresAt: now + CACHE_TTL_MS, value });
}

export async function analyzeYoutubeVideo(rawUrl: string, environment: YoutubeEnvironment = {}, options: YoutubeOptions = {}) {
  // A watch URL with an RD* list is YouTube's generated radio around one video,
  // not a stable public playlist. Analyse the explicit video instead; standalone
  // RD playlist URLs still follow the playlist path and receive its actionable
  // unsupported-radio error.
  const automaticRadioVideo = isAutomaticRadioVideoUrl(rawUrl);
  const hasPlaylist = !automaticRadioVideo && hasYoutubePlaylistParameter(rawUrl);
  const playlistId = automaticRadioVideo ? null : youtubePlaylistId(rawUrl);
  if (hasPlaylist && !playlistId) {
    throw new YoutubeAnalysisError({
      code: "INVALID_YOUTUBE_PLAYLIST_URL",
      message: "El enlace contiene una playlist de YouTube inválida.",
      status: 400,
      canPaste: false,
    });
  }

  if (playlistId) {
    const apiKey = environment.YOUTUBE_API_KEY?.trim();
    if (!apiKey) {
      throw new YoutubeAnalysisError({
        code: "YOUTUBE_PLAYLIST_API_KEY_REQUIRED",
        message: "Para importar una playlist completa, configura YOUTUBE_API_KEY en el servidor y habilita YouTube Data API v3. También puedes pegar la lista manualmente.",
        status: 503,
      });
    }

    const fetchImpl = options.fetchImpl ?? fetch;
    const retryDelayMs = options.retryDelayMs ?? 300;
    const deadlineAt = Date.now() + (options.overallTimeoutMs ?? 22_000);
    const now = options.now?.() ?? Date.now();
    const cacheKey = `playlist:${playlistId}:official`;
    const cached = analysisCache.get(cacheKey);
    if (cached && cached.expiresAt > now) return cached.value;
    if (cached) analysisCache.delete(cacheKey);

    try {
      const analysis = await readOfficialPlaylist(playlistId, apiKey, fetchImpl, retryDelayMs, deadlineAt);
      cacheAnalysis(cacheKey, analysis, now);
      return analysis;
    } catch (error) {
      if (error instanceof YoutubeAnalysisError) throw error;
      if (error instanceof YoutubeTransportError) {
        const timedOut = error.timedOut;
        const rateLimited = error.status === 429;
        const forbidden = error.status === 401 || error.status === 403;
        const notFound = error.status === 404;
        const unsupportedAutomatic = error.status === 400 && /^RD/i.test(playlistId);
        throw new YoutubeAnalysisError({
          code: timedOut
            ? "YOUTUBE_PLAYLIST_TIMEOUT"
            : rateLimited
              ? "YOUTUBE_PLAYLIST_RATE_LIMITED"
              : forbidden
                ? "YOUTUBE_PLAYLIST_API_REJECTED"
                : notFound || unsupportedAutomatic
                  ? "YOUTUBE_PLAYLIST_NOT_ACCESSIBLE"
                  : "YOUTUBE_PLAYLIST_UNAVAILABLE",
          message: timedOut
            ? "YouTube tardó demasiado en enumerar la playlist. Reintenta o divídela en listas más pequeñas."
            : rateLimited
              ? "YouTube agotó temporalmente la cuota para playlists. Reintenta más tarde o pega la lista manualmente."
              : forbidden
                ? "YouTube rechazó la clave o su cuota. Revisa YOUTUBE_API_KEY y que YouTube Data API v3 esté habilitada."
                : unsupportedAutomatic
                  ? "Esta radio automática de YouTube no publica sus elementos mediante la API. Abre el video individual o usa una playlist pública normal."
                  : notFound
                  ? "YouTube no encontró esta playlist o no permite leerla públicamente."
                  : "YouTube no pudo enumerar la playlist. Reintenta o pega la lista manualmente.",
          status: notFound ? 404 : unsupportedAutomatic ? 422 : 503,
          retryable: timedOut || rateLimited || (!forbidden && !notFound && !unsupportedAutomatic),
        });
      }
      throw error;
    }
  }

  const id = youtubeVideoId(rawUrl);
  if (!id || !/^[\w-]{11}$/.test(id)) {
    throw new YoutubeAnalysisError({
      code: "INVALID_YOUTUBE_URL",
      message: "Pega un enlace válido de YouTube.",
      status: 400,
      canPaste: false,
    });
  }

  const fetchImpl = options.fetchImpl ?? fetch;
  const retryDelayMs = options.retryDelayMs ?? 300;
  const deadlineAt = Date.now() + (options.overallTimeoutMs ?? 22_000);
  const now = options.now?.() ?? Date.now();
  const cacheKey = `${id}:${environment.YOUTUBE_API_KEY ? "official" : "public"}`;
  const cached = analysisCache.get(cacheKey);
  if (cached && cached.expiresAt > now) return cached.value;
  if (cached) analysisCache.delete(cacheKey);

  let official: ExtractedVideo | undefined;
  let officialError: unknown;
  if (environment.YOUTUBE_API_KEY?.trim()) {
    try {
      official = await readOfficialApi(id, environment.YOUTUBE_API_KEY.trim(), fetchImpl, retryDelayMs, deadlineAt);
      if (official.analysis) {
        cacheAnalysis(cacheKey, official.analysis, now);
        return official.analysis;
      }
    } catch (error) {
      officialError = error;
    }
  }

  const oembedPromise = readOembed(id, fetchImpl);
  let watch: ExtractedVideo | undefined;
  let watchError: unknown;
  try {
    watch = await readWatchPage(id, fetchImpl, retryDelayMs, deadlineAt);
    if (watch.analysis) {
      cacheAnalysis(cacheKey, watch.analysis, now);
      return watch.analysis;
    }
  } catch (error) {
    watchError = error;
  }

  const oembed = await oembedPromise;
  const metadata = official?.metadata ?? watch?.metadata ?? oembed.metadata;
  const analysisError = watchError instanceof YoutubeAnalysisError
    ? watchError
    : officialError instanceof YoutubeAnalysisError ? officialError : null;
  if (analysisError) {
    throw new YoutubeAnalysisError({
      code: analysisError.code,
      message: analysisError.message,
      status: analysisError.status,
      retryable: analysisError.retryable,
      canPaste: analysisError.canPaste,
      metadata,
    });
  }

  const transport = watchError instanceof YoutubeTransportError ? watchError : null;
  if (transport?.status === 404 || (oembed.status === 404 && !metadata)) {
    throw new YoutubeAnalysisError({
      code: "VIDEO_NOT_FOUND",
      message: "YouTube no encontró este video o ya no está disponible.",
      status: 404,
      metadata,
    });
  }
  if (transport) {
    const rateLimited = transport.status === 429;
    const accessLimited = transport.status === 403;
    const timedOut = transport.timedOut;
    throw new YoutubeAnalysisError({
      code: timedOut ? "YOUTUBE_TIMEOUT" : rateLimited ? "YOUTUBE_RATE_LIMITED" : accessLimited ? "YOUTUBE_ACCESS_LIMITED" : "YOUTUBE_UNAVAILABLE",
      message: timedOut
        ? "YouTube tardó demasiado en responder. Reintenta o pega la tracklist."
        : rateLimited
        ? "YouTube limitó temporalmente las consultas. Reintenta en unos minutos o pega la tracklist."
        : accessLimited
          ? "YouTube bloqueó la lectura automática desde el servidor. Puedes abrir el video y pegar su tracklist."
          : "YouTube no respondió después de dos intentos. Reintenta o pega la tracklist.",
      status: 503,
      retryable: !accessLimited,
      metadata,
    });
  }

  throw new YoutubeAnalysisError({
    code: "NO_PUBLIC_TRACKLIST",
    message: "El video existe, pero no publica una tracklist legible. Pega la lista o la transcripción para continuar.",
    status: 422,
    metadata,
  });
}

export async function handleVideoRequest(request: Request, environment: YoutubeEnvironment = {}, options: YoutubeOptions = {}) {
  let body: { url?: string };
  try {
    body = await request.json();
  } catch {
    return Response.json({
      error: "Solicitud inválida.",
      code: "INVALID_REQUEST",
      retryable: false,
      canPaste: false,
    }, { status: 400 });
  }

  try {
    return Response.json(await analyzeYoutubeVideo(String(body.url ?? ""), environment, options));
  } catch (error) {
    if (error instanceof YoutubeAnalysisError) {
      return Response.json({
        error: error.message,
        code: error.code,
        retryable: error.retryable,
        canPaste: error.canPaste,
        ...(error.metadata ? { metadata: error.metadata } : {}),
      }, { status: error.status });
    }
    return Response.json({
      error: "No se pudo leer el video.",
      code: "YOUTUBE_UNAVAILABLE",
      retryable: true,
      canPaste: true,
    }, { status: 503 });
  }
}
