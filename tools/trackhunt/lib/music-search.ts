export type MusicIdentity = {
  artist: string;
  title: string;
  version?: string;
};

export type MusicSearchQuery = {
  query: string;
  strategy: "exact" | "normalized" | "lead-artist" | "title-only" | "base-title";
};

const UNKNOWN_ARTIST = /^(?:artista por identificar|unknown artist|artista desconocido|unknown)$/i;
const VIDEO_NOISE = /\b(?:official|oficial|music video|video oficial|audio oficial|official audio|lyrics?|letra|visuali[sz]er|hd|hq|4k|topic)\b/gi;
const VERSION_WORDS = /\b(?:remix|mix|edit|extended|extension|radio|club|dub|vip|bootleg|mashup|rework|refix|flip|intro|transition|blend|toneplay|re[- ]?drum|instrumental|acapella|a cappella|live|version)\b/gi;
const COLLABORATOR_SEPARATOR = /\s+(?:feat(?:uring)?\.?|ft\.?|with|vs\.?|x)\s+|\s*(?:,|&|\/|\+|×)\s*/i;

export function normalizeMusicText(value: string) {
  return String(value ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\u200B-\u200D\u2060\uFEFF\u202A-\u202E\u2066-\u2069]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

export function cleanMusicLabel(value: string) {
  return String(value ?? "")
    .normalize("NFC")
    .replace(/[\u200B-\u200D\u2060\uFEFF\u202A-\u202E\u2066-\u2069]/g, "")
    .replace(/(^|\s)@([\p{L}\p{N}_.-]+)/gu, "$1$2")
    .replace(/\s+-\s+Topic\s*$/i, "")
    .replace(/[([][^)\]]*\b(?:official|oficial|music video|video oficial|audio oficial|official audio|lyrics?|letra|visuali[sz]er|hd|hq|4k)\b[^)\]]*[)\]]/gi, " ")
    .replace(VIDEO_NOISE, " ")
    .replace(/\[\s*\]|\(\s*\)/g, " ")
    .replace(/\s+/g, " ")
    .replace(/^[\s|·•—–-]+|[\s|·•—–-]+$/g, "")
    .trim();
}

export function splitMusicArtists(value: string) {
  const cleaned = cleanMusicLabel(value);
  if (!cleaned || UNKNOWN_ARTIST.test(cleaned)) return [];
  const parts = cleaned
    .split(COLLABORATOR_SEPARATOR)
    .map((part) => part.replace(/^@+/, "").trim())
    .filter((part) => part.length > 1);
  return [...new Map(parts.map((part) => [normalizeMusicText(part), part])).values()].filter(Boolean);
}

export function primaryMusicArtist(value: string) {
  return splitMusicArtists(value)[0] ?? cleanMusicLabel(value);
}

export function baseMusicTitle(value: string) {
  const cleaned = cleanMusicLabel(value);
  const withoutVersionBlock = cleaned
    .replace(/\s*[([][^)\]]*(?:remix|mix|edit|extended|radio|club|dub|vip|bootleg|mashup|rework|refix|flip|intro|transition|blend|toneplay|re[- ]?drum|instrumental|acapella|live|version)[^)\]]*[)\]]\s*$/i, "")
    .replace(/\s+(?:[-–—]\s*)?[^–—|()]*\b(?:remix|mix|edit|extended|radio|club|dub|vip|bootleg|mashup|rework|refix|flip|intro|transition|blend|toneplay|re[- ]?drum|instrumental|acapella|live|version)\b\s*$/i, "")
    .replace(/\s+/g, " ")
    .trim();
  return withoutVersionBlock || cleaned;
}

function uniqueQueries(rows: MusicSearchQuery[]) {
  const seen = new Set<string>();
  return rows.filter((row) => {
    const key = normalizeMusicText(row.query);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function musicSearchQueries(identity: MusicIdentity): MusicSearchQuery[] {
  const title = cleanMusicLabel(`${identity.title} ${identity.version ?? ""}`);
  const artists = splitMusicArtists(identity.artist);
  const artist = cleanMusicLabel(identity.artist);
  const lead = artists[0] ?? artist;
  const baseTitle = baseMusicTitle(title);
  const knownArtist = artist && !UNKNOWN_ARTIST.test(artist);

  return uniqueQueries([
    { query: knownArtist ? `${artist} ${title}` : title, strategy: "exact" },
    { query: knownArtist ? `${title} ${artists.join(" ") || artist}` : title, strategy: "normalized" },
    { query: lead ? `${title} ${lead}` : title, strategy: "lead-artist" },
    { query: title, strategy: "title-only" },
    { query: lead ? `${baseTitle} ${lead}` : baseTitle, strategy: "base-title" },
  ]);
}

function tokenSimilarity(expected: string, candidate: string) {
  const wanted = new Set(normalizeMusicText(expected).split(" ").filter(Boolean));
  const found = new Set(normalizeMusicText(candidate).split(" ").filter(Boolean));
  if (!wanted.size || !found.size) return 0;
  let shared = 0;
  wanted.forEach((word) => { if (found.has(word)) shared += 1; });
  const coverage = shared / wanted.size;
  const precision = shared / found.size;
  return coverage * .72 + precision * .28;
}

function versionTokens(value: string) {
  return new Set((normalizeMusicText(value.match(VERSION_WORDS)?.join(" ") ?? "")).split(" ").filter(Boolean));
}

export function scoreMusicCandidate(
  identity: MusicIdentity,
  candidate: { artist?: string; title: string; version?: string },
) {
  const wantedTitle = cleanMusicLabel(`${identity.title} ${identity.version ?? ""}`);
  const candidateTitle = cleanMusicLabel(`${candidate.title} ${candidate.version ?? ""}`);
  const titleScore = tokenSimilarity(wantedTitle, candidateTitle);
  const leadArtist = primaryMusicArtist(identity.artist);
  const allArtists = splitMusicArtists(identity.artist).join(" ");
  const artistScore = UNKNOWN_ARTIST.test(identity.artist) || !identity.artist.trim()
    ? .55
    : Math.max(tokenSimilarity(leadArtist, candidate.artist ?? ""), tokenSimilarity(allArtists, candidate.artist ?? ""));
  const wantedVersions = versionTokens(wantedTitle);
  const foundVersions = versionTokens(candidateTitle);
  const missingRequestedVersion = wantedVersions.size > 0 && ![...wantedVersions].some((word) => foundVersions.has(word));
  const unexpectedVersion = wantedVersions.size === 0 && foundVersions.size > 0;
  const replica = /\b(?:karaoke|tribute|originally performed|cover version)\b/i.test(candidateTitle)
    && !/\b(?:karaoke|tribute|cover)\b/i.test(wantedTitle);
  const exactTitle = normalizeMusicText(wantedTitle) === normalizeMusicText(candidateTitle);
  let score = titleScore * .74 + artistScore * .26 + (exactTitle ? .05 : 0);
  if (missingRequestedVersion) score -= .13;
  if (unexpectedVersion) score -= .08;
  if (replica) score -= .38;
  if (artistScore < .2 && !UNKNOWN_ARTIST.test(identity.artist)) score = Math.min(score, .7);
  return {
    score: Math.max(0, Math.min(1, score)),
    titleScore,
    artistScore,
    versionConflict: missingRequestedVersion || unexpectedVersion,
  };
}

const ACCENT_GROUPS: Record<string, string> = {
  a: "aáàâäãå",
  c: "cç",
  e: "eéèêë",
  i: "iíìîï",
  n: "nñ",
  o: "oóòôöõ",
  u: "uúùûü",
  y: "yýÿ",
};

export function accentInsensitiveRegexWord(value: string) {
  return normalizeMusicText(value).split("").map((character) => {
    const group = ACCENT_GROUPS[character];
    return group ? `[${group}]` : character.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }).join("");
}

export function musicSearchWords(value: string) {
  return normalizeMusicText(value).split(" ").filter((word) => word.length > 1);
}
