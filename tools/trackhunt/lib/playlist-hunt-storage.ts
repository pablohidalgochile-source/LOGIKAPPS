import { parseHuntInput, STAGES, type HuntInput, type HuntResult } from "./playlist-hunt";
export type HuntSnapshot = { id: string; savedAt: string; input: HuntInput; result: HuntResult; selection: string[]; name: string; resultReference: string; paths: Record<string, string> };
export function readHuntSnapshot(value: unknown): HuntSnapshot | null {
  try {
    if (!value || typeof value !== "object") return null;
    const s = value as HuntSnapshot;
    if (typeof s.id !== "string" || s.id.length > 120 || !Number.isFinite(Date.parse(s.savedAt))) return null;
    const input = parseHuntInput(s.input), r = s.result;
    if (!r || typeof r.name !== "string" || typeof r.summary !== "string" || !Array.isArray(r.warnings) || !r.warnings.every(w => typeof w === "string") || !Array.isArray(r.tracks) || r.tracks.length > 50) return null;
    if (!r.tracks.every(t => t && [t.id,t.artist,t.title,t.genre,t.region,t.language,t.reason].every(v=>typeof v === "string" && v.length <= 2000) && STAGES.includes(t.stage) && Number.isFinite(t.energy) && Number.isFinite(t.similarity) && (t.bpm === null || (Number.isFinite(t.bpm) && t.bpm >= 40 && t.bpm <= 220)) && (t.key === null || typeof t.key === "string") && ["Deezer","pending"].includes(t.bpmSource) && (t.duration === null || (Number.isFinite(t.duration) && t.duration >= 0)) && ["verified","unverified"].includes(t.catalogStatus) && (t.catalogStatus !== "verified" || (Number.isSafeInteger(t.deezerId) && t.deezerId! > 0)))) return null;
    const ids = new Set(r.tracks.map(t=>t.id));
    if (ids.size !== r.tracks.length) return null;
    const paths: Record<string,string> = {};
    if (s.paths && typeof s.paths === "object") for (const [id,path] of Object.entries(s.paths)) if (ids.has(id) && typeof path === "string" && path.length <= 2048 && !/[\r\n\0]/.test(path)) paths[id]=path;
    return { id:s.id, savedAt:s.savedAt, input, result:r, selection:Array.isArray(s.selection)?[...new Set(s.selection.filter(id=>ids.has(id)))]:[], name:typeof s.name === "string"?s.name.slice(0,100):r.name, resultReference:typeof s.resultReference === "string"?s.resultReference.slice(0,400):`${input.reference.artist} — ${input.reference.title}`, paths };
  } catch { return null; }
}
export function addHuntHistory(history: HuntSnapshot[], snapshot: HuntSnapshot): HuntSnapshot[] {
  return [snapshot, ...history.filter(s=>s.id !== snapshot.id)].slice(0,10);
}
