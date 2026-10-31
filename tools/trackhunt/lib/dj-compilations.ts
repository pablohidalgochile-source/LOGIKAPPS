import { musicSearchQueries } from "./music-search";

export const DJ_COMPILATIONS_HOME = "https://dj-compilations.com/";

export function djCompilationsQuery(track: { artist: string; title: string; version?: string }) {
  return musicSearchQueries(track)[0]?.query ?? `${track.artist} ${track.title}`.trim();
}

export function djCompilationsQueries(track: { artist: string; title: string; version?: string }) {
  return musicSearchQueries(track).map((row) => row.query);
}

export function djCompilationsBatch(tracks: Array<{ artist: string; title: string; version?: string }>) {
  return tracks.map((track, index) => {
    const queries = djCompilationsQueries(track);
    return [
      `# ${String(index + 1).padStart(2, "0")} · ${track.artist} — ${track.title}`,
      ...queries,
    ].join("\n");
  }).join("\n\n");
}

export async function copyDjCompilationsQuery(query: string) {
  if (!query || typeof navigator === "undefined" || !navigator.clipboard?.writeText) return false;
  try {
    await navigator.clipboard.writeText(query);
    return true;
  } catch {
    return false;
  }
}
