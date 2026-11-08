export const STAGES = ["Warm Up", "Playero", "Dancehall", "Afrobeat", "Reggaetón Caribe", "Peak"] as const;
export type Stage = typeof STAGES[number];
export type Controls = { discovery: number; commercial: number; energy: number; international: number; bpmMin: number; bpmMax: number; count: number; localRegion: string };
export type Feedback = { artist: string; title: string; decision: "accept" | "reject" };
export type HuntInput = { reference: { artist: string; title: string }; context: string; controls: Controls; feedback: Feedback[] };
export type HuntTrack = {
  id: string; artist: string; title: string; genre: string; region: string; language: string;
  bpm: number | null; bpmSource: "Deezer" | "pending"; key: string | null; energy: number;
  similarity: number; reason: string; stage: Stage; duration: number | null;
  deezerId: number | null; catalogStatus: "verified" | "unverified";
};
export type HuntResult = { name: string; summary: string; tracks: HuntTrack[]; warnings: string[]; stats?: { requested: number; checked: number; verified: number; rounds: number; unverified: number; outOfRange: number } };
export const DEFAULT_CONTROLS: Controls = { discovery: 35, commercial: 75, energy: 65, international: 60, bpmMin: 90, bpmMax: 105, count: 20, localRegion: "Chile" };
export const PRESETS = [
  { name: "NANOOK Caribbean Summer", context: "Playero, dancehall, Caribe, afrocaribeño, sensual, comercial. Un atardecer de verano que termina en fiesta.", controls: DEFAULT_CONTROLS },
  { name: "Sensual Rauw", context: "Rauw Alejandro, sensual, urbano, reggaetón melódico, noche cálida.", controls: { ...DEFAULT_CONTROLS, discovery: 25, energy: 45, bpmMin: 85, bpmMax: 110 } },
  { name: "Atemporal", context: "Canciones que sobreviven a las modas, clásicos y descubrimientos con personalidad. Evita depender solo de novedades.", controls: { ...DEFAULT_CONTROLS, discovery: 65, commercial: 45, bpmMin: 80, bpmMax: 125 } },
];
const text = (v: unknown, max: number) => typeof v === "string" ? v.trim().slice(0, max) : "";
export function identity(artist: string, title: string) {
  return `${artist}|${title}`.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9|]+/g, " ").trim();
}
export function parseHuntInput(raw: unknown): HuntInput {
  if (!raw || typeof raw !== "object") throw new Error("Solicitud inválida.");
  const data = raw as Record<string, unknown>;
  const ref = data.reference as Record<string, unknown> | undefined;
  const reference = { artist: text(ref?.artist, 160), title: text(ref?.title, 200) };
  if (!reference.artist || !reference.title) throw new Error("Confirma artista y título de la referencia.");
  const c = data.controls as Record<string, unknown> | undefined;
  const number = (key: string, min: number, max: number) => {
    const n = c?.[key];
    if (typeof n !== "number" || !Number.isFinite(n) || n < min || n > max) throw new Error(`Revisa el control ${key}.`);
    return Math.round(n);
  };
  const controls: Controls = { discovery: number("discovery", 0, 100), commercial: number("commercial", 0, 100), energy: number("energy", 0, 100), international: number("international", 0, 100), bpmMin: number("bpmMin", 40, 220), bpmMax: number("bpmMax", 40, 220), count: number("count", 5, 50), localRegion: text(c?.localRegion, 80) || "Chile" };
  if (controls.bpmMin > controls.bpmMax) throw new Error("El BPM mínimo no puede superar al máximo.");
  const feedback: Feedback[] = Array.isArray(data.feedback) ? data.feedback.slice(-100).flatMap(f => {
    if (!f || typeof f !== "object" || !["accept", "reject"].includes(f.decision)) return [];
    const artist = text(f.artist, 160), title = text(f.title, 200);
    return artist && title ? [{ artist, title, decision: f.decision as Feedback["decision"] }] : [];
  }) : [];
  return { reference, context: text(data.context, 2000), controls, feedback };
}
export function buildJourney(tracks: HuntTrack[]): HuntTrack[] {
  return [...tracks].sort((a, b) => STAGES.indexOf(a.stage) - STAGES.indexOf(b.stage) || a.energy - b.energy || (a.bpm ?? 0) - (b.bpm ?? 0) || a.id.localeCompare(b.id));
}
export function trackLinks(track: Pick<HuntTrack, "artist" | "title" | "deezerId">) {
  const q = encodeURIComponent(`${track.artist} ${track.title}`);
  return { spotify: `https://open.spotify.com/search/${q}`, deezer: track.deezerId ? `https://www.deezer.com/track/${track.deezerId}` : `https://www.deezer.com/search/${q}`, youtube: `https://www.youtube.com/results?search_query=${q}` };
}
const line = (v: string) => v.replace(/[\r\n\0]/g, " ");
const csv = (v: unknown) => { const s = String(v ?? ""); return `"${(/^[=+@\-\t\r]/.test(s) ? "'" + s : s).replace(/"/g, '""')}"`; };
const xml = (v: string) => v.replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[c]!);
export function exportFiles(name: string, tracks: HuntTrack[], paths: Record<string, string> = {}) {
  const linked = tracks.filter(t => /^\/(?!\/)/.test(paths[t.id] ?? "") && !/[\r\n\0]/.test(paths[t.id]));
  const rows = tracks.map((t, i) => [i + 1, t.artist, t.title, t.bpm, t.bpmSource, t.key, t.genre, t.energy, t.region, t.language, t.similarity, t.stage, t.reason, t.catalogStatus, ...Object.values(trackLinks(t))].map(csv).join(","));
  return {
    "playlist.csv": "\uFEFF" + ["Orden,Artista,Titulo,BPM,Fuente BPM,Key,Genero,Energia estimada,Region estimada,Idioma estimado,Afinidad editorial,Etapa,Motivo,Verificacion,Spotify,Deezer,YouTube", ...rows].join("\r\n"),
    "playlist.txt": line(name) + "\n\n" + tracks.map((t, i) => `${i + 1}. ${line(t.artist)} — ${line(t.title)}\n${line(t.reason)}\n${trackLinks(t).deezer}`).join("\n\n"),
    "enlaces-plataformas.csv": "\uFEFF" + ["Artista,Titulo,Spotify,Deezer,YouTube", ...tracks.map(t => [t.artist, t.title, ...Object.values(trackLinks(t))].map(csv).join(","))].join("\r\n"),
    "playlist.m3u8": ["#EXTM3U", `#PLAYLIST:${line(name)}`, ...linked.flatMap(t => [`#EXTINF:${t.duration ?? -1},${line(t.artist)} - ${line(t.title)}`, paths[t.id]])].join("\n"),
    "rekordbox.xml": `<?xml version="1.0" encoding="UTF-8"?>\n<DJ_PLAYLISTS Version="1.0.0"><PRODUCT Name="TrackHunt" Version="1" Company="TrackHunt"/><COLLECTION Entries="${linked.length}">${linked.map((t, i) => `<TRACK TrackID="${i + 1}" Name="${xml(t.title)}" Artist="${xml(t.artist)}" Location="${xml('file://localhost' + paths[t.id].split('/').map(encodeURIComponent).join('/'))}"${t.bpm ? ` AverageBpm="${t.bpm}"` : ""}/>`).join("")}</COLLECTION><PLAYLISTS><NODE Type="0" Name="ROOT" Count="1"><NODE Name="${xml(name)}" Type="1" KeyType="0" Entries="${linked.length}">${linked.map((_, i) => `<TRACK Key="${i + 1}"/>`).join("")}</NODE></NODE></PLAYLISTS></DJ_PLAYLISTS>`,
    "metadata.json": JSON.stringify({ name, tracks, linkedLocalFiles: linked.length }, null, 2),
    "LEEME.txt": `Playlist Hunt / TrackHunt\n${tracks.length} canciones. ${linked.length} archivos locales vinculados.\nNo contiene audio ni descarga música.\nBPM: catálogo Deezer cuando existe; key pendiente de análisis. Género, región, idioma, energía, afinidad y etapas son sugerencias IA, no análisis acústico.\nSpotify y YouTube incluyen enlaces de búsqueda; no implican una coincidencia verificada. Deezer usa enlaces exactos solo donde se verificó la identidad.\nM3U8 y Rekordbox XML contienen SOLO las rutas absolutas de archivos propios que vinculaste. Verifica esas rutas y analiza los archivos en tu software DJ. No se inventan ubicaciones de audio.\nSerato: importa tus archivos propios desde Files; no se genera un .crate propietario. CSV/TXT sirven como guía. YouTube: enlaces para selección manual; crear una playlist requiere OAuth y no está integrado en esta versión.\n`,
  };
}
// ZIP STORE (UTF-8, no compression): one portable download, no extra dependency.
export function zipFiles(files: Record<string, string>): Uint8Array {
  const encode = new TextEncoder(), chunks: Uint8Array[] = [], central: Uint8Array[] = []; let offset = 0;
  const crc32 = (bytes: Uint8Array) => { let crc = -1; for (const b of bytes) { crc ^= b; for (let j = 0; j < 8; j++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1)); } return (crc ^ -1) >>> 0; };
  for (const [name, value] of Object.entries(files)) {
    const n = encode.encode(name), data = encode.encode(value), crc = crc32(data);
    const h = new Uint8Array(30 + n.length), v = new DataView(h.buffer);
    v.setUint32(0, 0x04034b50, true); v.setUint16(4, 20, true); v.setUint16(6, 0x800, true); v.setUint16(12, 33, true); v.setUint32(14, crc, true); v.setUint32(18, data.length, true); v.setUint32(22, data.length, true); v.setUint16(26, n.length, true); h.set(n, 30);
    const c = new Uint8Array(46 + n.length), d = new DataView(c.buffer);
    d.setUint32(0, 0x02014b50, true); d.setUint16(4, 20, true); d.setUint16(6, 20, true); d.setUint16(8, 0x800, true); d.setUint16(14, 33, true); d.setUint32(16, crc, true); d.setUint32(20, data.length, true); d.setUint32(24, data.length, true); d.setUint16(28, n.length, true); d.setUint32(42, offset, true); c.set(n, 46);
    chunks.push(h, data); central.push(c); offset += h.length + data.length;
  }
  const size = central.reduce((sum, c) => sum + c.length, 0), end = new Uint8Array(22), v = new DataView(end.buffer);
  v.setUint32(0, 0x06054b50, true); v.setUint16(8, central.length, true); v.setUint16(10, central.length, true); v.setUint32(12, size, true); v.setUint32(16, offset, true);
  const out = new Uint8Array(offset + size + 22); let at = 0; for (const c of [...chunks, ...central, end]) { out.set(c, at); at += c.length; } return out;
}
