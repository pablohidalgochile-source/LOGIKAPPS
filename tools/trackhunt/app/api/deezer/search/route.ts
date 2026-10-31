import { musicSearchQueries, scoreMusicCandidate, type MusicSearchQuery } from "../../../../lib/music-search";

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

type SearchQuery = { clientId: number; artist: string; title: string };
type RankedTrack = {
  track: DeezerTrack;
  score: number;
  titleScore: number;
  artistScore: number;
  versionConflict: boolean;
  search: MusicSearchQuery;
};

function publicMatch(row: RankedTrack) {
  return {
    id: row.track.id,
    title: row.track.title,
    artist: row.track.artist?.name ?? "Artista desconocido",
    album: row.track.album?.title ?? "",
    cover: row.track.album?.cover_medium ?? row.track.album?.cover_small ?? "",
    link: row.track.link,
    duration: row.track.duration,
    preview: row.track.preview,
    score: Number(row.score.toFixed(3)),
    titleScore: Number(row.titleScore.toFixed(3)),
    artistScore: Number(row.artistScore.toFixed(3)),
    versionConflict: row.versionConflict,
    searchStrategy: row.search.strategy,
    searchedQuery: row.search.query,
  };
}

async function searchOne(query: SearchQuery, fetchSearch: (search: MusicSearchQuery) => Promise<DeezerTrack[]>) {
  const variants = musicSearchQueries(query);
  const candidates = new Map<number, RankedTrack>();
  const searchedQueries: string[] = [];

  for (const search of variants) {
    searchedQueries.push(search.query);
    const tracks = await fetchSearch(search);
    for (const track of tracks) {
      if (!Number.isFinite(track.id) || !track.title || !track.link) continue;
      const scored = scoreMusicCandidate(query, {
        artist: track.artist?.name,
        title: track.title_short ?? track.title,
        version: track.title_version,
      });
      const ranked = { track, ...scored, search };
      const previous = candidates.get(track.id);
      if (!previous || ranked.score > previous.score) candidates.set(track.id, ranked);
    }
    const best = [...candidates.values()].sort((a, b) => b.score - a.score)[0];
    if (best && best.score >= .9 && best.titleScore >= .94 && best.artistScore >= .72 && !best.versionConflict) break;
  }

  const ranked = [...candidates.values()]
    .filter((row) => row.titleScore >= .42 && row.score >= .38)
    .sort((a, b) => b.score - a.score || b.titleScore - a.titleScore)
    .slice(0, 4);
  const alternatives = ranked.map(publicMatch);
  return { clientId: query.clientId, match: alternatives[0] ?? null, alternatives, searchedQueries };
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

  const requestCache = new Map<string, Promise<DeezerTrack[]>>();
  const fetchSearch = (search: MusicSearchQuery) => {
    const key = search.query.toLocaleLowerCase("es");
    const cached = requestCache.get(key);
    if (cached) return cached;
    const pending = (async () => {
      const endpoint = new URL("https://api.deezer.com/search");
      endpoint.searchParams.set("q", search.query);
      endpoint.searchParams.set("limit", "12");
      try {
        const response = await fetch(endpoint, {
          headers: { accept: "application/json", "user-agent": "TrackHunt/2.0" },
        });
        if (!response.ok) return [];
        const payload = await response.json() as { data?: DeezerTrack[] };
        return Array.isArray(payload.data) ? payload.data : [];
      } catch {
        return [];
      }
    })();
    requestCache.set(key, pending);
    return pending;
  };

  const results = [];
  for (let index = 0; index < queries.length; index += 3) {
    results.push(...await Promise.all(queries.slice(index, index + 3).map((query) => searchOne(query, fetchSearch))));
  }
  return Response.json({ results }, { headers: { "cache-control": "private, max-age=60" } });
}
