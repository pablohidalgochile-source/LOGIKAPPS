export const ASSISTANT_ORIGIN = "http://127.0.0.1:43871";
export type ShazamTrack = { identity: string; title: string; artist: string; seconds: number; lastSeen: number; hits: number; speedMultiplier?: number };
export type ShazamReview = { seconds: number; originalIdentity: string; artist: string; title: string; decision: "pending" | "confirmed" | "rejected" };
export type ShazamSnapshot = {
  id: string; fileName: string; status: "idle" | "scanning" | "paused" | "error" | "complete" | "cancelled";
  message: string; duration: number; step: number; clipSeconds: number; phase: "initial" | "refinement" | "targeted";
  source?: "file" | "youtube-tab"; sourceURL?: string;
  reviews?: ShazamReview[]; revision?: number; savedAt?: string; saveError?: string; needsFile?: boolean;
  completed: number; total: number; currentSeconds: number; tracks: ShazamTrack[]; unknown: number[];
};
function bounded(value: unknown, max: number): value is string { return typeof value === "string" && value.length <= max; }
function number(value: unknown, max = 28_800): value is number { return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= max; }
export function parseAssistantSnapshot(value: unknown): ShazamSnapshot {
  if (!value || typeof value !== "object") throw new Error("Respuesta inválida del asistente.");
  const v = value as ShazamSnapshot;
  if (!bounded(v.id, 100) || !v.id || !bounded(v.fileName, 1024) || !bounded(v.message, 2000) ||
      !["idle", "scanning", "paused", "error", "complete", "cancelled"].includes(v.status) ||
      !["initial", "refinement", "targeted"].includes(v.phase) || ![30, 60].includes(v.step) || v.clipSeconds !== 12 ||
      !number(v.duration) || !number(v.currentSeconds, v.duration) || !number(v.total, 5000) ||
      !Number.isInteger(v.total) || !number(v.completed, v.total) || !Number.isInteger(v.completed) ||
      !Array.isArray(v.tracks) || v.tracks.length > 5000 || !Array.isArray(v.unknown) || v.unknown.length > 5000) {
    throw new Error("El asistente envió datos de barrido inválidos. Actualiza el asistente.");
  }
  if (v.source !== undefined && !["file", "youtube-tab"].includes(v.source)) throw new Error("Fuente de captura inválida.");
  if (v.source === "youtube-tab" && (typeof v.sourceURL !== "string" || !/^https:\/\/www\.youtube\.com\/watch\?v=[A-Za-z0-9_-]{11}$/.test(v.sourceURL))) throw new Error("Video de origen inválido.");
  for (const track of v.tracks) {
    if (!track || !bounded(track.identity, 600) || !bounded(track.title, 500) || !track.title.trim() ||
        !bounded(track.artist, 500) || !track.artist.trim() || !number(track.seconds, v.duration) ||
        !number(track.lastSeen, v.duration) || track.lastSeen < track.seconds || !number(track.hits, 5000) ||
        track.hits < 1 || !Number.isInteger(track.hits) || (track.speedMultiplier !== undefined && track.speedMultiplier !== 0.945)) throw new Error("El asistente envió una canción inválida.");
  }
  if (!v.unknown.every(t => number(t, v.duration))) throw new Error("Tiempos de reconocimiento inválidos.");
  if (v.revision !== undefined && (!number(v.revision, 1e9) || !Number.isInteger(v.revision))) throw new Error("Revisión inválida.");
  if (v.reviews !== undefined && (!Array.isArray(v.reviews) || v.reviews.length > 5000 || v.reviews.some(r => !r || !number(r.seconds, v.duration) || !bounded(r.originalIdentity, 600) || !bounded(r.artist, 500) || !r.artist.trim() || !bounded(r.title, 500) || !r.title.trim() || !["pending", "confirmed", "rejected"].includes(r.decision)))) throw new Error("Correcciones inválidas.");
  if (v.savedAt !== undefined && !bounded(v.savedAt, 100) || v.saveError !== undefined && !bounded(v.saveError, 2000)) throw new Error("Guardado inválido.");
  return { ...v, tracks: [...v.tracks].sort((a, b) => a.seconds - b.seconds) };
}
export function shazamTime(seconds: number): string {
  const whole = Math.floor(seconds);
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, "0")}`;
}
export function reviewFor(snapshot: ShazamSnapshot, track: ShazamTrack) {
  return snapshot.reviews?.filter(r => r.originalIdentity === track.identity && r.seconds >= track.seconds && r.seconds <= track.lastSeen).at(-1);
}
// A warning, not a verdict: legitimate long tracks and remixes can still be confirmed manually.
export function possibleCompilation(track: ShazamTrack): boolean {
  return /\b(?:mega\s?mix|medley|non[\s-]?stop|dj\s+mix|mix\s+(?:best|de|of|session|20\d\d)|best\s+of|mega\s+\S)/i.test(track.title)
    || (track.hits >= 10 && track.lastSeen - track.seconds >= 600);
}
export function reviewedTracks(snapshot: ShazamSnapshot) {
  return snapshot.tracks.flatMap(t => {
    const review = reviewFor(snapshot, t);
    return review?.decision === "rejected" || (possibleCompilation(t) && review?.decision !== "confirmed") ? [] : [{ ...t, artist: review?.artist ?? t.artist, title: review?.title ?? t.title }];
  });
}
export function songKey(track: {artist: string; title: string}) {
  // Keep version words: an instrumental, remix and original are different songs for export.
  const normalize = (text: string) => text.normalize("NFKC").toLocaleLowerCase().replace(/\s+/g, " ").trim();
  return JSON.stringify([normalize(track.artist), normalize(track.title)]);
}
export function deezerNeedsReview(candidate:{score:number;artistScore?:number;versionConflict?:boolean}) {
  return !Number.isFinite(candidate.score) || candidate.score < .78 || Boolean(candidate.versionConflict)
    || (candidate.artistScore !== undefined && (!Number.isFinite(candidate.artistScore) || candidate.artistScore < .65));
}
export function uniqueDeezerMatches<T extends {status: string; recognitionReview?: string; recognitionApproved?: boolean; deezerApproved?:boolean; deezer?: {id:number;link:string;score?:number;artistScore?:number;versionConflict?:boolean}}>(tracks:T[]) {
  const seen=new Set<number>();
  return tracks.filter((t):t is T & {deezer:NonNullable<T["deezer"]>} => {
    const id=t.deezer?.id;
    if(t.status!=="matched" || (t.recognitionReview && !t.recognitionApproved) || (!t.deezerApproved && t.deezer && deezerNeedsReview({...t.deezer,score:t.deezer.score??0})) || !id || !Number.isSafeInteger(id) || id<1 || seen.has(id)) return false;
    seen.add(id); return true;
  });
}
export function finalShazamTracks(snapshot: ShazamSnapshot) {
  const groups = new Map<string, ShazamTrack & { occurrences: number[]; evidenceHits: number; recognitionReview?: string; recognitionConfirmed: boolean; explicitPending:boolean }>();
  for (const t of reviewedTracks(snapshot).sort((a,b) => a.seconds-b.seconds)) {
    const confirmed = snapshot.tracks.some(original => original.seconds === t.seconds && original.identity === t.identity && reviewFor(snapshot,original)?.decision === "confirmed");
    const explicitPending=snapshot.tracks.some(original => original.seconds===t.seconds && original.identity===t.identity && reviewFor(snapshot,original)?.decision==="pending");
    const key = songKey(t), existing = groups.get(key);
    if (existing) {
      existing.occurrences.push(t.seconds); existing.evidenceHits += t.hits;
      existing.recognitionConfirmed ||= confirmed;
      existing.explicitPending ||= explicitPending;
    } else groups.set(key, {...t, occurrences:[t.seconds], evidenceHits:t.hits, recognitionConfirmed:confirmed,explicitPending});
  }
  return [...groups.values()].map(t => ({...t, recognitionReview: !t.recognitionConfirmed && t.explicitPending
    ? "Revisión guardada pendiente: verifica artista y versión antes de incluirla."
    : !t.recognitionConfirmed && t.evidenceHits < 2 ? "Una sola muestra reconocida; falta corroborar la canción y su versión." : undefined}));
}
export function suggestedReviewPoints(snapshot: ShazamSnapshot) {
  // Bound the next pass. Native reanalysis filters already consulted points again.
  const points = [...snapshot.unknown.map(seconds=>({seconds,speedMultiplier:1})),
    ...snapshot.tracks.filter(t=>possibleCompilation(t) || t.hits===1).map(t=>({seconds:t.seconds,speedMultiplier:possibleCompilation(t)||t.speedMultiplier ? .945 : 1}))]
    .sort((a,b)=>a.seconds-b.seconds);
  const plan: {start:number;end:number;speedMultiplier:number}[]=[];
  for(const p of points) {
    const start=Math.round((p.seconds+3)*1000)/1000;
    if(start+12>snapshot.duration || plan.some(x=>Math.abs(x.start-start)<30)) continue;
    plan.push({start,end:start+1,speedMultiplier:p.speedMultiplier});
    if(plan.length===16) break;
  }
  return plan;
}
export function shazamAnalysis(snapshot: ShazamSnapshot) {
  return {
    title: (snapshot.source === "youtube-tab" ? snapshot.fileName : snapshot.fileName.replace(/\.[a-z0-9]+$/i, "")) || "Set reconocido con Shazam",
    channel: snapshot.source === "youtube-tab" ? "Shazam · fragmentos de YouTube" : "Shazam · fragmentos del archivo local", thumbnail: "", source: "shazam-audio" as const,
    recognitionJob: snapshot.id,
    tracks: finalShazamTracks(snapshot).map(t => ({ time: `≈ ${shazamTime(t.seconds)}`, seconds: t.seconds, artist: t.artist, title: t.title,
      occurrences:t.occurrences, evidenceHits:t.evidenceHits, recognitionReview:t.recognitionReview })),
  };
}
