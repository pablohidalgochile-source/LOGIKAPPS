import type { TrackReference } from "./video-tracklist";

export type AcrCloudTrackSource = "music" | "cover_song";

export type AcrCloudTrackReference = TrackReference & {
  provider: "acrcloud";
  source: AcrCloudTrackSource;
  score?: number;
  playedDuration?: number;
  acrid?: string;
};

export type AcrCloudScanStateName = "processing" | "ready" | "no-results" | "error" | "unknown";

export type AcrCloudScanState = {
  status: AcrCloudScanStateName;
  state: AcrCloudScanStateName;
  rawState: -3 | -2 | -1 | 0 | 1 | null;
  ready: boolean;
  terminal: boolean;
};

export type AcrCloudFileScan = AcrCloudScanState & {
  tracks: AcrCloudTrackReference[];
  duration?: number;
  message?: string;
};

type UnknownRecord = Record<string, unknown>;

type Candidate = {
  seconds: number;
  artist: string;
  title: string;
  provider: "acrcloud";
  source: AcrCloudTrackSource;
  score?: number;
  playedDuration?: number;
  acrid?: string;
};

type CandidateCluster = {
  firstSeen: number;
  lastSeen: number;
  coveredUntil: number;
  best: Candidate;
};

const REPEATED_DETECTION_GAP_SECONDS = 90;
const PLAYED_DURATION_GRACE_SECONDS = 30;
const MAX_REASONABLE_DURATION_SECONDS = 24 * 60 * 60;

function record(value: unknown): UnknownRecord | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as UnknownRecord
    : null;
}

function finiteNumber(value: unknown) {
  if (typeof value === "number") return Number.isFinite(value) ? value : undefined;
  if (typeof value !== "string" || !value.trim()) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function nonEmptyString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function firstNumber(source: UnknownRecord, keys: string[]) {
  for (const key of keys) {
    const value = finiteNumber(source[key]);
    if (value !== undefined) return value;
  }
  return undefined;
}

function firstString(source: UnknownRecord, keys: string[]) {
  for (const key of keys) {
    const value = nonEmptyString(source[key]);
    if (value) return value;
  }
  return undefined;
}

function secondsFromClock(value: unknown) {
  if (typeof value !== "string" || !/^\d{1,3}:\d{2}(?::\d{2})?$/.test(value.trim())) return undefined;
  const pieces = value.trim().split(":").map(Number);
  if (pieces.some((piece) => !Number.isFinite(piece)) || pieces.slice(1).some((piece) => piece >= 60)) return undefined;
  return pieces.reduce((total, piece) => total * 60 + piece, 0);
}

function offsetSeconds(source: UnknownRecord) {
  const explicitSeconds = firstNumber(source, [
    "offset",
    "offset_seconds",
    "offsetSeconds",
    "play_offset",
    "play_offset_seconds",
    "playOffsetSeconds",
    "start_offset",
    "start_offset_seconds",
    "startSeconds",
  ]);
  if (explicitSeconds !== undefined) return Math.max(0, explicitSeconds);

  const milliseconds = firstNumber(source, [
    "offset_ms",
    "offsetMs",
    "play_offset_ms",
    "playOffsetMs",
    "start_offset_ms",
    "startOffsetMs",
    "sample_begin_time_offset_ms",
  ]);
  if (milliseconds !== undefined) return Math.max(0, milliseconds / 1000);

  for (const key of ["time", "timestamp", "start_time", "played_at"]) {
    const seconds = secondsFromClock(source[key]);
    if (seconds !== undefined) return seconds;
  }
  return undefined;
}

function durationSeconds(source: UnknownRecord) {
  const seconds = firstNumber(source, [
    "played_duration",
    "played_duration_seconds",
    "playedDuration",
    "playedDurationSeconds",
  ]);
  const milliseconds = firstNumber(source, ["played_duration_ms", "playedDurationMs"]);
  const duration = seconds ?? (milliseconds === undefined ? undefined : milliseconds / 1000);
  if (duration === undefined || duration < 0 || duration > MAX_REASONABLE_DURATION_SECONDS) return undefined;
  return duration;
}

function artistName(value: unknown): string | undefined {
  const direct = nonEmptyString(value);
  if (direct) return direct;
  const artist = record(value);
  return artist ? firstString(artist, ["name", "artist", "title"]) : undefined;
}

function artistsFrom(source: UnknownRecord) {
  const artists = source.artists;
  if (Array.isArray(artists)) {
    const names = artists.map(artistName).filter((name): name is string => Boolean(name));
    if (names.length) return [...new Set(names)].join(" & ");
  }
  return artistName(source.artist) ?? artistName(source.performer);
}

function metadataSources(source: UnknownRecord) {
  const nested = [record(source.result), record(source.metadata), record(source.song), record(source.track)].filter(
    (value): value is UnknownRecord => Boolean(value),
  );
  return [source, ...nested];
}

function parseCandidate(value: unknown, source: AcrCloudTrackSource): Candidate | null {
  const raw = record(value);
  if (!raw) return null;
  const sources = metadataSources(raw);
  const title = sources.map((item) => firstString(item, ["title", "name"])).find(Boolean);
  const artist = sources.map(artistsFrom).find(Boolean);
  const seconds = sources.map(offsetSeconds).find((offset) => offset !== undefined);
  if (!title || !artist || seconds === undefined) return null;

  const score = sources.map((item) => firstNumber(item, ["score", "confidence"])).find((item) => item !== undefined);
  const playedDuration = sources.map(durationSeconds).find((item) => item !== undefined);
  const acrid = sources.map((item) => firstString(item, ["acrid", "id"])).find(Boolean);
  return {
    seconds,
    artist,
    title,
    provider: "acrcloud",
    source,
    ...(score === undefined ? {} : { score }),
    ...(playedDuration === undefined ? {} : { playedDuration }),
    ...(acrid ? { acrid } : {}),
  };
}

function normalizeIdentity(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\b(?:feat(?:uring)?|ft)\.?\b/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function primaryArtist(value: string) {
  return normalizeIdentity(value.split(/\s+(?:&|and|x|,|\/|feat(?:uring)?\.?|ft\.?)\s+/i, 1)[0] ?? value);
}

function sameIdentity(left: Candidate, right: Candidate) {
  if (left.acrid && right.acrid && left.acrid === right.acrid) return true;
  if (normalizeIdentity(left.title) !== normalizeIdentity(right.title)) return false;
  const leftArtist = normalizeIdentity(left.artist);
  const rightArtist = normalizeIdentity(right.artist);
  return leftArtist === rightArtist || primaryArtist(left.artist) === primaryArtist(right.artist);
}

function candidateQuality(candidate: Candidate) {
  return {
    score: candidate.score ?? -1,
    duration: candidate.playedDuration ?? -1,
    source: candidate.source === "music" ? 1 : 0,
  };
}

function betterCandidate(left: Candidate, right: Candidate) {
  const a = candidateQuality(left);
  const b = candidateQuality(right);
  if (a.score !== b.score) return a.score > b.score ? left : right;
  if (a.duration !== b.duration) return a.duration > b.duration ? left : right;
  return a.source >= b.source ? left : right;
}

function candidateCoveredUntil(candidate: Candidate) {
  return candidate.seconds + (candidate.playedDuration ?? 0);
}

function belongsToCluster(candidate: Candidate, cluster: CandidateCluster) {
  if (!sameIdentity(candidate, cluster.best)) return false;
  const closeToPreviousDetection = candidate.seconds - cluster.lastSeen <= REPEATED_DETECTION_GAP_SECONDS;
  const insideReportedPlay = candidate.seconds <= cluster.coveredUntil + PLAYED_DURATION_GRACE_SECONDS;
  return closeToPreviousDetection || insideReportedPlay;
}

function formatTime(seconds: number) {
  const whole = Math.max(0, Math.round(seconds));
  const hours = Math.floor(whole / 3600);
  const minutes = Math.floor((whole % 3600) / 60);
  const remainder = whole % 60;
  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, "0")}:${String(remainder).padStart(2, "0")}`
    : `${minutes}:${String(remainder).padStart(2, "0")}`;
}

function dedupeCandidates(candidates: Candidate[]) {
  const clusters: CandidateCluster[] = [];
  for (const candidate of [...candidates].sort((left, right) => left.seconds - right.seconds)) {
    const cluster = [...clusters].reverse().find((item) => belongsToCluster(candidate, item));
    if (!cluster) {
      clusters.push({
        firstSeen: candidate.seconds,
        lastSeen: candidate.seconds,
        coveredUntil: candidateCoveredUntil(candidate),
        best: candidate,
      });
      continue;
    }
    cluster.lastSeen = Math.max(cluster.lastSeen, candidate.seconds);
    cluster.coveredUntil = Math.max(cluster.coveredUntil, candidateCoveredUntil(candidate));
    cluster.best = betterCandidate(cluster.best, candidate);
  }

  return clusters
    .sort((left, right) => left.firstSeen - right.firstSeen)
    .map(({ firstSeen, best }): AcrCloudTrackReference => ({
      time: formatTime(firstSeen),
      seconds: Math.max(0, Math.round(firstSeen)),
      artist: best.artist,
      title: best.title,
      provider: best.provider,
      source: best.source,
      ...(best.score === undefined ? {} : { score: best.score }),
      ...(best.playedDuration === undefined ? {} : { playedDuration: best.playedDuration }),
      ...(best.acrid ? { acrid: best.acrid } : {}),
    }));
}

function recognizedState(value: unknown): -3 | -2 | -1 | 0 | 1 | null {
  const parsed = finiteNumber(value);
  return parsed === -3 || parsed === -2 || parsed === -1 || parsed === 0 || parsed === 1 ? parsed : null;
}

export function parseAcrCloudState(value: unknown): AcrCloudScanState {
  const rawState = recognizedState(value);
  if (rawState === 0) return { status: "processing", state: "processing", rawState, ready: false, terminal: false };
  if (rawState === 1) return { status: "ready", state: "ready", rawState, ready: true, terminal: true };
  if (rawState === -1) return { status: "no-results", state: "no-results", rawState, ready: false, terminal: true };
  if (rawState === -2 || rawState === -3) return { status: "error", state: "error", rawState, ready: false, terminal: true };
  return { status: "unknown", state: "unknown", rawState: null, ready: false, terminal: false };
}

function unwrapFile(payload: unknown): UnknownRecord | null {
  const root = record(payload);
  if (!root) return null;
  if (Array.isArray(root.data)) return record(root.data[0]);
  const data = record(root.data);
  if (data) return data;
  const wrappedResult = record(root.result);
  if (wrappedResult && ("state" in wrappedResult || "results" in wrappedResult || "data" in wrappedResult)) {
    return unwrapFile(wrappedResult);
  }
  return root;
}

function parseResults(value: unknown) {
  if (typeof value !== "string") return record(value);
  try {
    return record(JSON.parse(value));
  } catch {
    return null;
  }
}

export function parseAcrCloudFile(payload: unknown): AcrCloudFileScan {
  const file = unwrapFile(payload);
  const status = parseAcrCloudState(file?.state);
  const results = parseResults(file?.results);
  const duration = file
    ? firstNumber(file, ["duration", "duration_seconds", "durationSeconds"])
      ?? ((firstNumber(file, ["duration_ms", "durationMs"]) ?? 0) / 1000 || undefined)
    : undefined;
  const message = file
    ? firstString(file, ["message", "status_message", "error_message", "error"])
    : undefined;
  const details = {
    ...(duration === undefined || duration < 0 ? {} : { duration }),
    ...(message ? { message: message.slice(0, 500) } : {}),
  };
  if (!results) return { ...status, ...details, tracks: [] };

  const candidates: Candidate[] = [];
  const append = (value: unknown, source: AcrCloudTrackSource) => {
    if (!Array.isArray(value)) return;
    for (const item of value) {
      const candidate = parseCandidate(item, source);
      if (candidate) candidates.push(candidate);
    }
  };
  append(results.music, "music");
  append(results.cover_songs ?? results.coverSongs, "cover_song");
  return { ...status, ...details, tracks: dedupeCandidates(candidates) };
}

export const parseAcrCloudFileScan = parseAcrCloudFile;

export function parseAcrCloudTracks(payload: unknown) {
  return parseAcrCloudFile(payload).tracks;
}
