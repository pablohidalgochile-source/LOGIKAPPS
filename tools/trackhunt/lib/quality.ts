import { DJ_COMPILATIONS_HOME, djCompilationsQuery } from "./dj-compilations";

export type QualityIdentity = {
  title: string;
  artist: string;
  version?: string;
  album?: string;
  isrc?: string;
  source: string;
};

export type QualityCandidate = {
  id: string;
  provider: "Apple Music" | "Deezer" | "Web";
  sourceName?: string;
  title: string;
  artist: string;
  album?: string;
  version?: string;
  url: string;
  artwork?: string;
  match: "exact" | "likely" | "review";
  identityScore: number;
  evidence: string[];
  qualityNote: string;
};

export type StoreSearch = {
  provider: string;
  url: string;
  role: "download-store" | "artist-store" | "streaming" | "dj-pool";
  note: string;
  priority: number;
  query?: string;
  action?: "open" | "copy-open";
};

export type QualitySourceStatus = {
  name: string;
  status: "ok" | "empty" | "unavailable" | "not-configured";
  message: string;
};

const VERSION_WORDS = new Set([
  "remix", "mix", "edit", "extended", "radio", "club", "dub", "bootleg",
  "rework", "remaster", "remastered", "live", "instrumental", "acapella",
  "original", "version", "vip", "flip", "mashup",
]);
const GENERIC_VERSION_WORDS = new Set(["mix", "version"]);

export function normalizeQualityText(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

function words(value: string) {
  return normalizeQualityText(value).split(" ").filter(Boolean);
}

function tokenScore(expected: string, actual: string) {
  const wanted = new Set(words(expected));
  const found = new Set(words(actual));
  if (!wanted.size || !found.size) return 0;
  let shared = 0;
  wanted.forEach((word) => { if (found.has(word)) shared += 1; });
  return (2 * shared) / (wanted.size + found.size);
}

function versionTokens(value: string) {
  return new Set(words(value).filter((word) => VERSION_WORDS.has(word)));
}

export function identityScore(
  expected: Pick<QualityIdentity, "title" | "artist" | "version">,
  actual: { title: string; artist: string; version?: string },
) {
  const expectedFullTitle = `${expected.title} ${expected.version ?? ""}`.trim();
  const actualFullTitle = `${actual.title} ${actual.version ?? ""}`.trim();
  let title = tokenScore(expectedFullTitle, actualFullTitle);
  const artist = tokenScore(expected.artist, actual.artist);
  const wantedVersions = versionTokens(expectedFullTitle);
  const foundVersions = versionTokens(actualFullTitle);
  const wantedDistinctive = [...wantedVersions].filter((word) => !GENERIC_VERSION_WORDS.has(word));
  const foundDistinctive = [...foundVersions].filter((word) => !GENERIC_VERSION_WORDS.has(word));
  const qualifierMatch = actual.title.match(/\(([^)]+)\)|\[([^\]]+)\]/);
  const actualQualifier = actual.version?.trim() || qualifierMatch?.[1]?.trim() || qualifierMatch?.[2]?.trim() || "";
  const unmarkedOriginal = wantedDistinctive.length === 1 && wantedDistinctive[0] === "original" && !actualQualifier;
  if (unmarkedOriginal) title = Math.max(title, tokenScore(expected.title, actual.title));
  let score = title * 0.7 + artist * 0.3;
  if (artist < 0.34) score -= 0.3;
  else if (artist < 0.65) score -= 0.2;
  if (wantedVersions.size) {
    const missing = unmarkedOriginal ? 0 : [...wantedVersions].filter((word) => !foundVersions.has(word)).length;
    score -= Math.min(0.3, missing * 0.12);
    if (wantedDistinctive.length && foundDistinctive.length && !wantedDistinctive.some((word) => foundDistinctive.includes(word))) score -= 0.28;
    else if (wantedDistinctive.includes("original") && actualQualifier && !foundDistinctive.includes("original")) score -= 0.25;
  } else if ([...foundVersions].some((word) => word !== "original" && word !== "version")) {
    score -= 0.22;
  }
  return Math.max(0, Math.min(1, Number(score.toFixed(3))));
}

export function matchLabel(score: number): QualityCandidate["match"] {
  if (score >= 0.88) return "exact";
  if (score >= 0.68) return "likely";
  return "review";
}

export function safeQualityUrl(raw: string) {
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:" || url.username || url.password || url.port) return null;
    const host = url.hostname.toLowerCase().replace(/^www\./, "");
    const allowed = [
      "music.apple.com", "itunes.apple.com", "deezer.com", "beatport.com",
      "bandcamp.com", "traxsource.com", "junodownload.com", "qobuz.com",
      "soundcloud.com", "mzstatic.com", "dzcdn.net",
    ];
    if (!allowed.some((domain) => host === domain || host.endsWith(`.${domain}`))) return null;
    return url.toString();
  } catch {
    return null;
  }
}

export function buildStoreSearches(identity: Pick<QualityIdentity, "title" | "artist" | "version" | "isrc">): StoreSearch[] {
  const query = `${identity.artist} ${identity.title} ${identity.version ?? ""} ${identity.isrc ?? ""}`.replace(/\s+/g, " ").trim();
  const poolQuery = djCompilationsQuery(identity);
  const encoded = encodeURIComponent(query);
  return [
    { provider: "Beatport", url: `https://www.beatport.com/search?q=${encoded}`, role: "download-store", note: "Tienda especializada para música electrónica. Confirma edición y formato antes de comprar.", priority: 1, action: "open" },
    { provider: "DJ Compilations", url: DJ_COMPILATIONS_HOME, role: "dj-pool", note: "Copia la consulta y abre tu sesión del pool. Revisa la versión exacta y descarga solo desde tu cuenta.", priority: 2, query: poolQuery, action: "copy-open" },
    { provider: "Bandcamp", url: `https://bandcamp.com/search?q=${encoded}&item_type=t`, role: "artist-store", note: "Compra directa a sellos y artistas; revisa los formatos ofrecidos por cada publicación.", priority: 3, action: "open" },
    { provider: "Traxsource", url: `https://www.traxsource.com/search?term=${encoded}`, role: "download-store", note: "Catálogo DJ. Verifica que sea el mismo mix, duración y sello.", priority: 4, action: "open" },
    { provider: "Juno Download", url: `https://www.junodownload.com/search/?q%5Ball%5D%5B%5D=${encoded}`, role: "download-store", note: "Busca la edición exacta y comprueba el formato disponible.", priority: 5, action: "open" },
    { provider: "Qobuz", url: `https://www.qobuz.com/us-en/search?q=${encoded}`, role: "download-store", note: "Catálogo de alta resolución cuando la publicación está disponible en tu región.", priority: 6, action: "open" },
    { provider: "SoundCloud", url: `https://soundcloud.com/search/sounds?q=${encoded}`, role: "streaming", note: "Útil para localizar edits y descargas autorizadas por el creador.", priority: 7, action: "open" },
  ];
}
