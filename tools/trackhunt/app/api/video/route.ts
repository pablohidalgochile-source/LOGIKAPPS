type TrackReference = {
  time: string;
  seconds: number;
  artist: string;
  title: string;
};

type JsonObject = Record<string, unknown>;

function youtubeId(rawUrl: string) {
  try {
    const url = new URL(rawUrl);
    const host = url.hostname.replace(/^www\./, "");
    if (host === "youtu.be") return url.pathname.split("/").filter(Boolean)[0] ?? null;
    if (!["youtube.com", "m.youtube.com", "music.youtube.com"].includes(host)) return null;
    if (url.pathname === "/watch") return url.searchParams.get("v");
    const parts = url.pathname.split("/").filter(Boolean);
    if (["shorts", "embed", "live"].includes(parts[0])) return parts[1] ?? null;
  } catch {
    return null;
  }
  return null;
}

function parseSeconds(value: string) {
  return value.split(":").map(Number).reduce((total, part) => total * 60 + part, 0);
}

function normalize(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function splitCredit(value: string) {
  const clean = value
    .replace(/^\s*(?:[-•*]|\d+[.)])\s*/, "")
    .replace(/\s*(?:\([^)]*(?:official|video|audio)[^)]*\)|\[[^\]]*(?:official|video|audio)[^\]]*\])\s*$/i, "")
    .trim();
  const pieces = clean.split(/\s+(?:[-–—|])\s+/);
  if (pieces.length < 2) return null;
  const artist = pieces.shift()?.trim() ?? "";
  const title = pieces.join(" — ").trim();
  return artist && title ? { artist, title } : null;
}

function tracksFromDescription(description: string) {
  const tracks: TrackReference[] = [];
  for (const rawLine of description.split(/\r?\n/)) {
    const line = rawLine.trim();
    const leading = line.match(/^\[?((?:\d{1,2}:)?\d{1,2}:\d{2})\]?\s*(?:[-–—|:]\s*)?(.*)$/);
    const trailing = line.match(/^(.*?)\s+(?:[-–—|]\s*)?\[?((?:\d{1,2}:)?\d{1,2}:\d{2})\]?$/);
    const time = leading?.[1] ?? trailing?.[2];
    const creditText = leading?.[2] ?? trailing?.[1];
    if (!time || !creditText) continue;
    const credit = splitCredit(creditText);
    if (!credit) continue;
    tracks.push({ time, seconds: parseSeconds(time), ...credit });
  }
  return tracks;
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

function uniqueTracks(...groups: TrackReference[][]) {
  const found = new Map<string, TrackReference>();
  for (const track of groups.flat()) {
    const key = `${normalize(track.artist)}|${normalize(track.title)}`;
    const previous = found.get(key);
    if (!previous || (previous.time === "--:--" && track.time !== "--:--")) found.set(key, track);
  }
  return [...found.values()].sort((a, b) => {
    if (a.time === "--:--" && b.time !== "--:--") return 1;
    if (a.time !== "--:--" && b.time === "--:--") return -1;
    return a.seconds - b.seconds;
  });
}

export async function POST(request: Request) {
  let body: { url?: string };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Solicitud inválida." }, { status: 400 });
  }

  const id = youtubeId(String(body.url ?? ""));
  if (!id || !/^[\w-]{11}$/.test(id)) {
    return Response.json({ error: "Pega un enlace válido de YouTube." }, { status: 400 });
  }

  try {
    const response = await fetch(`https://www.youtube.com/watch?v=${id}&hl=es`, {
      headers: {
        accept: "text/html,application/xhtml+xml",
        "accept-language": "es-ES,es;q=0.9,en;q=0.8",
        "user-agent": "Mozilla/5.0 (compatible; SetlistToDeezer/1.0)",
      },
      signal: AbortSignal.timeout(20_000),
    });
    if (!response.ok) throw new Error("YouTube no respondió.");
    const html = await response.text();
    const player = jsonAfterMarker(html, ["var ytInitialPlayerResponse =", "ytInitialPlayerResponse =", 'ytInitialPlayerResponse":']);
    const initial = jsonAfterMarker(html, ["var ytInitialData =", "window[\"ytInitialData\"] =", 'ytInitialData":']);
    const details = player?.videoDetails as JsonObject | undefined;
    const description = typeof details?.shortDescription === "string" ? details.shortDescription : "";
    const descriptionTracks = tracksFromDescription(description);
    const creditTracks = collectMusicCredits(initial);
    const tracks = uniqueTracks(descriptionTracks, creditTracks);

    if (!tracks.length) {
      return Response.json({
        error: "El video no publica una tracklist legible. Pega la lista manualmente para buscarla en Deezer.",
      }, { status: 422 });
    }

    const thumbnails = (details?.thumbnail as JsonObject | undefined)?.thumbnails;
    const thumbnail = Array.isArray(thumbnails)
      ? [...thumbnails].reverse().find((item) => item && typeof item === "object" && typeof (item as JsonObject).url === "string")
      : null;
    return Response.json({
      title: typeof details?.title === "string" ? details.title : "Set de YouTube",
      channel: typeof details?.author === "string" ? details.author : "YouTube",
      thumbnail: thumbnail && typeof thumbnail === "object" ? String((thumbnail as JsonObject).url) : `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
      source: descriptionTracks.length ? "youtube-description" : "youtube-credits",
      tracks,
    });
  } catch (error) {
    return Response.json({
      error: error instanceof Error ? `No se pudo leer el video: ${error.message}` : "No se pudo leer el video.",
    }, { status: 502 });
  }
}
