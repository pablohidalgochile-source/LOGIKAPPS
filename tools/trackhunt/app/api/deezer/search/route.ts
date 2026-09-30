type DeezerTrack = {
  id: number;
  title: string;
  title_short?: string;
  title_version?: string;
  link: string;
  duration: number;
  preview: string;
  artist?: { name?: string };
  album?: { title?: string; cover_medium?: string; cover_small?: string };
};

type SearchQuery = {
  clientId: number;
  artist: string;
  title: string;
};

function normalize(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\b(feat|featuring|ft|remix|mix|edit|extended|original|version)\b/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function wordScore(expected: string, candidate: string) {
  const wanted = new Set(normalize(expected).split(" ").filter(Boolean));
  const found = new Set(normalize(candidate).split(" ").filter(Boolean));
  if (!wanted.size || !found.size) return 0;
  let intersection = 0;
  wanted.forEach((word) => {
    if (found.has(word)) intersection += 1;
  });
  return intersection / Math.max(wanted.size, found.size);
}

function scoreTrack(query: SearchQuery, track: DeezerTrack) {
  const title = `${track.title_short ?? track.title} ${track.title_version ?? ""}`;
  const titleScore = wordScore(query.title, title);
  const artistScore = query.artist === "Artista por identificar"
    ? .5
    : wordScore(query.artist, track.artist?.name ?? "");
  return Math.min(1, titleScore * .72 + artistScore * .28);
}

async function searchOne(query: SearchQuery) {
  const terms = query.artist === "Artista por identificar"
    ? query.title
    : `${query.artist} ${query.title}`;
  const endpoint = new URL("https://api.deezer.com/search");
  endpoint.searchParams.set("q", terms);
  endpoint.searchParams.set("limit", "8");

  const response = await fetch(endpoint, {
    headers: { accept: "application/json", "user-agent": "SetlistToDeezer/1.0" },
  });
  if (!response.ok) return { clientId: query.clientId, match: null };
  const payload = await response.json() as { data?: DeezerTrack[] };
  const ranked = (payload.data ?? [])
    .map((track) => ({ track, score: scoreTrack(query, track) }))
    .sort((a, b) => b.score - a.score);
  const best = ranked[0];
  if (!best || best.score < .34) return { clientId: query.clientId, match: null };

  return {
    clientId: query.clientId,
    match: {
      id: best.track.id,
      title: best.track.title,
      artist: best.track.artist?.name ?? "Artista desconocido",
      album: best.track.album?.title ?? "",
      cover: best.track.album?.cover_medium ?? best.track.album?.cover_small ?? "",
      link: best.track.link,
      duration: best.track.duration,
      preview: best.track.preview,
      score: Number(best.score.toFixed(3)),
    },
  };
}

export async function POST(request: Request) {
  let body: { queries?: SearchQuery[] };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Solicitud inválida" }, { status: 400 });
  }

  const queries = (body.queries ?? [])
    .filter((query) => Number.isFinite(query.clientId) && query.title?.trim())
    .slice(0, 50)
    .map((query) => ({
      clientId: query.clientId,
      artist: String(query.artist ?? "").slice(0, 160),
      title: String(query.title).slice(0, 200),
    }));
  if (!queries.length) return Response.json({ error: "No hay pistas para buscar" }, { status: 400 });

  const results = [];
  for (let index = 0; index < queries.length; index += 6) {
    results.push(...await Promise.all(queries.slice(index, index + 6).map(searchOne)));
  }
  return Response.json({ results }, { headers: { "cache-control": "private, max-age=60" } });
}
