export type Song = { title: string; artist: string; artwork?: string; source: string; url?: string };
export type Version = { id: string; title: string; creator: string; platform: "SoundCloud" | "Bandcamp"; url: string; kind: string; evidence: string; match: "title-artist" | "title"; artwork?: string };
export type SourceStatus = { name: "SoundCloud" | "Bandcamp"; status: "ok" | "empty" | "unavailable" | "not-configured"; message: string; searchUrl: string };

export function normalize(value: string) {
  return value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}
export function versionKind(value: string) {
  const match = value.match(/\b(remix|bootleg|mashup|extended|flip|rework|edit)\b/i);
  return match ? match[1].charAt(0).toUpperCase() + match[1].slice(1).toLowerCase() : null;
}
export function originalTitle(value: string) {
  return value.replace(/\s*[([]\s*(?:feat\.?|ft\.?|featuring)\s+[^)\]]*[)\]]/gi, "").replace(/\s+(?:feat\.?|ft\.?|featuring)\s+.*$/i, "").replace(/\s+/g, " ").trim();
}
export function trackUrl(raw: string): { url: string; platform: Version["platform"] } | null {
  try {
    const u = new URL(raw);
    if (u.protocol !== "https:" || u.username || u.password || u.port) return null;
    const host = u.hostname.replace(/^www\./, "");
    const parts = u.pathname.split("/").filter(Boolean);
    if (host === "soundcloud.com" && parts.length === 2 && !["search", "discover", "you", "settings", "tags", "charts", "pages", "terms-of-use"].includes(parts[0]) && !["sets", "tracks", "albums", "reposts", "likes", "popular-tracks"].includes(parts[1])) return { url: `https://soundcloud.com/${parts.join("/")}`, platform: "SoundCloud" };
    if (/^[a-z0-9-]+\.bandcamp\.com$/.test(host) && parts.length === 2 && parts[0] === "track") return { url: `https://${host}/${parts.join("/")}`, platform: "Bandcamp" };
  } catch { /* Not a public track URL. */ }
  return null;
}
export function mediaLink(raw: string) {
  let u: URL;
  try { u = new URL(raw); } catch { throw new Error("Pega un enlace completo de YouTube o SoundCloud."); }
  if (u.protocol !== "https:" || u.username || u.password || u.port) throw new Error("Usa un enlace HTTPS de YouTube o SoundCloud.");
  const host = u.hostname.replace(/^www\./, "");
  let id: string | null = null;
  if (host === "youtu.be") id = u.pathname.slice(1).split("/")[0];
  if (["youtube.com", "m.youtube.com", "music.youtube.com"].includes(host)) {
    id = u.pathname === "/watch" ? u.searchParams.get("v") : /^\/(shorts|live|embed)\//.test(u.pathname) ? u.pathname.split("/")[2] : null;
  }
  if (id && /^[\w-]{11}$/.test(id)) return { platform: "YouTube", url: `https://www.youtube.com/watch?v=${id}`, id };
  const track = trackUrl(raw);
  if (track?.platform === "SoundCloud") return { ...track, id: "" };
  throw new Error("Usa un video de YouTube o un enlace directo a una pista de SoundCloud; no una playlist ni un enlace acortado.");
}
export function tentativeSong(value: string): Pick<Song, "title" | "artist"> {
  const cleaned = value.replace(/[([][^)\]]*(?:official|oficial|lyrics|video|audio)[^)\]]*[)\]]/gi, "").trim();
  const parts = cleaned.split(/\s+[-–—|]\s+/);
  return parts.length > 1 ? { artist: parts.shift()!.slice(0, 160), title: originalTitle(parts.join(" — ")).slice(0, 200) } : { artist: "", title: originalTitle(cleaned).slice(0, 200) };
}
export function toVersion(raw: { title: string; url: string; description?: string; creator?: string; artwork?: string }, song: Pick<Song, "title" | "artist">): Version | null {
  const link = trackUrl(raw.url);
  const kind = versionKind(raw.title);
  if (!link || !kind) return null;
  const title = normalize(raw.title);
  const wanted = normalize(originalTitle(song.title)).split(" ").filter(Boolean);
  // Title evidence is required; snippets alone are not enough to link two songs.
  if (!wanted.length || !wanted.every(word => title.split(" ").includes(word))) return null;
  const artistWords = normalize(song.artist).split(" ").filter(word => word.length > 1);
  const hasArtist = artistWords.length > 0 && artistWords.every(word => normalize(`${raw.title} ${raw.description ?? ""}`).split(" ").includes(word));
  return { id: link.url, ...link, title: raw.title.slice(0, 260), creator: raw.creator || "Consultar creador en la fuente", kind, evidence: (raw.description ?? "").slice(0, 400), match: hasArtist ? "title-artist" : "title", artwork: raw.artwork };
}
