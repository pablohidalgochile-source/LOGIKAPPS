"use client";

/* eslint-disable @next/next/no-html-link-for-pages -- Vinext's Link prefetch currently throws at runtime. */

import { useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import ShazamScanner from "./ShazamScanner";
import { shazamAnalysis, songKey, uniqueDeezerMatches, deezerNeedsReview, shazamTime } from "../../lib/shazam-assistant";
import { DJ_COMPILATIONS_HOME, djCompilationsBatch, djCompilationsQueries, djCompilationsQuery } from "../../lib/dj-compilations";
import {
  generateFileZillaQueueXml,
  generateTrackHuntJob,
  type FileTransferProtocol,
  type FileZillaQueueInput,
} from "../../lib/filezilla-queue";
import {
  MAX_FTP_LIST_BYTES,
  ftpListingLimitProblem,
  parseRemoteListing,
  uniqueLocalNames,
  type FtpRemoteCandidate,
} from "../../lib/filezilla-ui";
import { explorationTitle, remixDestinations } from "../../lib/remix";
import type { SourceStatus, Version } from "../../lib/remix";
import { accentInsensitiveRegexWord, musicSearchQueries, musicSearchWords, primaryMusicArtist, scoreMusicCandidate } from "../../lib/music-search";
import { parseTracklistText } from "../../lib/video-tracklist";

type DeezerMatch = {
  id: number;
  title: string;
  artist: string;
  album: string;
  cover: string;
  link: string;
  duration: number;
  preview: string;
  score: number;
  titleScore?: number;
  artistScore?: number;
  versionConflict?: boolean;
  searchStrategy?: string;
  searchedQuery?: string;
};

type TrackStatus = "idle" | "searching" | "matched" | "review" | "missing";

type Track = {
  id: number;
  time: string;
  seconds: number;
  artist: string;
  title: string;
  selected: boolean;
  status: TrackStatus;
  deezer?: DeezerMatch;
  deezerAlternatives?: DeezerMatch[];
  deezerSearchQueries?: string[];
  occurrences?: number[];
  evidenceHits?: number;
  recognitionReview?: string;
  recognitionApproved?: boolean;
  deezerApproved?: boolean;
  selectionTouched?: boolean;
};

type VideoAnalysis = {
  title: string;
  channel: string;
  thumbnail: string;
  source: "youtube-credits" | "youtube-description" | "youtube-data-api" | "youtube-playlist-api" | "manual" | "spotify" | "acrcloud-audio" | "shazam-audio";
  recognitionJob?: string;
  tracks: Array<Pick<Track, "time" | "seconds" | "artist" | "title" | "occurrences" | "evidenceHits" | "recognitionReview">>;
  coverage?: {
    status: "complete" | "partial";
    reason?: "youtube-public-credits";
    message?: string;
  };
};

type Notice = {
  kind: "success" | "info" | "error";
  message: string;
};

type AnalysisProblem = {
  message: string;
  code?: string;
  retryable: boolean;
  canPaste: boolean;
};

type RecentSet = {
  id: string;
  savedAt: number;
  url: string;
  playlistName: string;
  video: VideoAnalysis;
  tracks: Track[];
  remixResults?: RemixBatchTrackResult[];
};

type RemixBatchTrackResult = {
  clientId: string;
  index: number;
  title: string;
  artist: string;
  status: "ok" | "empty" | "partial" | "unavailable" | "not-configured" | "invalid";
  versions: Version[];
  sources: SourceStatus[];
  searchedAt?: string;
  error?: string;
};

type RemixProgress = { done: number; total: number };

type AcousticConfig = {
  available: boolean;
  zeroCost: boolean;
};

type AcousticJob = {
  id: string;
  url: string;
  createdAt: number;
  status: "queued" | "processing" | "paused";
  progress?: number;
  message?: string;
};

class VideoAnalysisFailure extends Error {
  problem: AnalysisProblem;

  constructor(problem: AnalysisProblem) {
    super(problem.message);
    this.name = "VideoAnalysisFailure";
    this.problem = problem;
  }
}

const RECENT_SETS_KEY = "trackhunt-recent-sets-v1";
const ACOUSTIC_JOB_KEY = "trackhunt-acoustic-job-v1";
const ACOUSTIC_JOB_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_RECENT_SETS = 20;
const ACOUSTIC_FALLBACK_CODES = new Set([
  "NO_PUBLIC_TRACKLIST",
  "YOUTUBE_TIMEOUT",
  "YOUTUBE_RATE_LIMITED",
  "YOUTUBE_ACCESS_LIMITED",
  "YOUTUBE_UNAVAILABLE",
  "YOUTUBE_FORMAT_CHANGED",
]);

const SAMPLE_VIDEO = "https://www.youtube.com/watch?v=JHdNEzKVBoQ";

const SAMPLE_TRACKS: Track[] = [
  { id: 1, time: "01:27", seconds: 87, artist: "HydroBoyz", title: "Hindabuilding", selected: true, status: "idle" },
  { id: 2, time: "02:41", seconds: 161, artist: "Calvin Harris, Disciples", title: "How Deep Is Your Love (Disciples & Unorthodox Remix)", selected: true, status: "idle" },
  { id: 3, time: "03:11", seconds: 191, artist: "J Balvin, Willy William", title: "Mi Gente (Alesso Remix)", selected: true, status: "idle" },
  { id: 4, time: "07:00", seconds: 420, artist: "Ricky Martin", title: "María (Spanglish Extended)", selected: true, status: "idle" },
  { id: 5, time: "09:07", seconds: 547, artist: "Mastiksoul", title: "Manya e Grande (Original Mix)", selected: true, status: "idle" },
  { id: 6, time: "11:58", seconds: 718, artist: "Prince Royce, KARYO", title: "I Want It That Way (KARYO Remix)", selected: true, status: "idle" },
  { id: 7, time: "13:52", seconds: 832, artist: "Rihanna", title: "Only Girl (In The World)", selected: true, status: "idle" },
  { id: 8, time: "14:28", seconds: 868, artist: "Neru Americano, Scro Q Cuia", title: "Tic Taa", selected: true, status: "idle" },
  { id: 9, time: "18:15", seconds: 1095, artist: "Nari", title: "Diamond", selected: true, status: "idle" },
  { id: 10, time: "18:56", seconds: 1136, artist: "M3B8", title: "Rolle Flow", selected: true, status: "idle" },
];

const SAMPLE_META: VideoAnalysis = {
  title: "AFRO BROS @ LATINVILLAGE — SPECIAL CLOSING SET",
  channel: "Afro Bros",
  thumbnail: "https://i.ytimg.com/vi/JHdNEzKVBoQ/hqdefault.jpg",
  source: "youtube-credits",
  tracks: SAMPLE_TRACKS,
  coverage: {
    status: "partial",
    reason: "youtube-public-credits",
    message: "YouTube solo publicó 10 créditos musicales. Pueden ser una parte del mix, no la tracklist completa.",
  },
};

function parseTracklist(text: string, order: "artist-title" | "title-artist"): Track[] {
  return parseTracklistText(text, order).map((track, index) => ({
    ...track,
    id: index + 1,
    selected: true,
    status: "idle" as const,
  }));
}

function remixSearchHref(track: Pick<Track, "artist" | "title">) {
  const params = new URLSearchParams({ artist: track.artist, title: explorationTitle(track.title), auto: "1" });
  return `/?${params.toString()}`;
}

function durationLabel(seconds: number) {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const tail = String(seconds % 60).padStart(2, "0");
  return hours ? `${hours}:${String(minutes).padStart(2, "0")}:${tail}` : `${minutes}:${tail}`;
}

function escapeCsv(value: string | number) {
  return `"${String(value).replaceAll('"', '""')}"`;
}

function saveFile(name: string, content: string, type: string) {
  const href = URL.createObjectURL(new Blob([content], { type }));
  const anchor = document.createElement("a");
  anchor.href = href;
  anchor.download = name;
  anchor.click();
  URL.revokeObjectURL(href);
}

function safeFileName(value: string) {
  return value.replace(/[^a-z0-9áéíóúñ_-]+/gi, "-").replace(/^-|-$/g, "") || "track";
}

function fileZillaSearchPattern(sourceTracks: Array<Pick<Track, "artist" | "title">>) {
  return sourceTracks
    .map((track) => {
      const artist = musicSearchWords(primaryMusicArtist(track.artist)).slice(0, 4).map(accentInsensitiveRegexWord).join(".*");
      const title = musicSearchWords(track.title).slice(0, 9).map(accentInsensitiveRegexWord).join(".*");
      if (!artist) return title;
      if (!title) return artist;
      return `(${artist}.*${title}|${title}.*${artist})`;
    })
    .filter(Boolean)
    .join("|");
}

function suggestedTrack(candidate: FtpRemoteCandidate, sourceTracks: Track[]) {
  let best: { track: Track; score: number } | null = null;
  for (const track of sourceTracks) {
    const score = scoreMusicCandidate(track, { title: candidate.remoteName }).score;
    if (!best || score > best.score) best = { track, score };
  }
  return best && best.score >= 0.38 ? best : null;
}

function createLocalJobId(prefix: string) {
  const suffix = typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  return `${prefix}-${suffix}`;
}

function externalVideoHref(value: string) {
  try {
    const url = new URL(value.trim());
    const host = url.hostname.toLowerCase().replace(/^www\./, "");
    const isYouTube = host === "youtu.be" || host === "youtube.com" || host.endsWith(".youtube.com");
    return (url.protocol === "https:" || url.protocol === "http:") && isYouTube ? url.toString() : "";
  } catch {
    return "";
  }
}

function isStoredRemixResult(value: unknown): value is RemixBatchTrackResult {
  if (!value || typeof value !== "object") return false;
  const row = value as Partial<RemixBatchTrackResult>;
  const validStatus = ["ok", "empty", "partial", "unavailable", "not-configured", "invalid"].includes(String(row.status));
  const isSafeHttpsUrl = (urlValue: unknown) => {
    if (typeof urlValue !== "string") return false;
    try {
      const url = new URL(urlValue);
      return url.protocol === "https:" && !url.username && !url.password;
    } catch {
      return false;
    }
  };
  const validVersion = (version: unknown) => {
    if (!version || typeof version !== "object") return false;
    const item = version as Partial<Version>;
    return typeof item.id === "string" && typeof item.title === "string" &&
      typeof item.creator === "string" && typeof item.kind === "string" &&
      typeof item.evidence === "string" && ["SoundCloud", "Bandcamp"].includes(String(item.platform)) &&
      ["title-artist", "title"].includes(String(item.match)) && isSafeHttpsUrl(item.url) &&
      (item.artwork === undefined || isSafeHttpsUrl(item.artwork));
  };
  const validSource = (source: unknown) => {
    if (!source || typeof source !== "object") return false;
    const item = source as Partial<SourceStatus>;
    return ["SoundCloud", "Bandcamp"].includes(String(item.name)) &&
      ["ok", "empty", "unavailable", "not-configured"].includes(String(item.status)) &&
      typeof item.message === "string" && isSafeHttpsUrl(item.searchUrl);
  };
  return typeof row.clientId === "string" && typeof row.index === "number" && Number.isFinite(row.index) &&
    typeof row.title === "string" && typeof row.artist === "string" && validStatus &&
    Array.isArray(row.versions) && row.versions.every(validVersion) &&
    Array.isArray(row.sources) && row.sources.every(validSource) &&
    (row.searchedAt === undefined || typeof row.searchedAt === "string") &&
    (row.error === undefined || typeof row.error === "string");
}

function remixResultTitle(track: Pick<Track, "title">) {
  return explorationTitle(track.title).trim().slice(0, 200);
}

function remixResultArtist(track: Pick<Track, "artist">) {
  return track.artist.trim().slice(0, 160);
}

function validRemixResultsForTracks(
  sourceTracks: Track[],
  sourceResults: RemixBatchTrackResult[],
  storedIdAliases?: Map<string, string>,
) {
  const tracksById = new Map(sourceTracks.map((track, index) => [String(track.id), { track, index }]));
  const seen = new Set<string>();
  return sourceResults.flatMap((result) => {
    const clientId = storedIdAliases?.get(result.clientId) ?? result.clientId;
    const current = tracksById.get(clientId);
    if (!current || seen.has(clientId)) return [];
    if (result.artist !== remixResultArtist(current.track) || result.title !== remixResultTitle(current.track)) return [];
    seen.add(clientId);
    return [{ ...result, clientId, index: current.index }];
  }).sort((left, right) => left.index - right.index)
    .map((result, index) => ({ ...result, index }));
}

function restoreTrackState(sourceTracks: Track[]) {
  const idCounts = new Map<string, number>();
  for (const track of sourceTracks) {
    const key = String(track.id);
    idCounts.set(key, (idCounts.get(key) ?? 0) + 1);
  }

  const reservedIds = new Set(
    sourceTracks
      .filter((track) => Number.isSafeInteger(track.id) && track.id > 0 && idCounts.get(String(track.id)) === 1)
      .map((track) => track.id),
  );
  const usedIds = new Set<number>();
  const aliases = new Map<string, string>();
  let nextId = 1;
  const tracks = sourceTracks.map((track) => {
    const storedKey = String(track.id);
    let id = Number.isSafeInteger(track.id) && track.id > 0 && idCounts.get(storedKey) === 1
      ? track.id
      : 0;
    if (!id) {
      while (reservedIds.has(nextId) || usedIds.has(nextId)) nextId += 1;
      id = nextId;
      nextId += 1;
    }
    usedIds.add(id);
    if (idCounts.get(storedKey) === 1) aliases.set(storedKey, String(id));
    return {
      ...track,
      id,
      selected: typeof track.selected === "boolean" ? track.selected : true,
      status: track.deezer
        ? (track.status === "review" ? "review" as const : "matched" as const)
        : (track.status === "missing" ? "missing" as const : "idle" as const),
    };
  });
  return { tracks, aliases };
}

function isRecentSet(value: unknown): value is RecentSet {
  if (!value || typeof value !== "object") return false;
  const item = value as Partial<RecentSet>;
  const videoValue = item.video as Partial<VideoAnalysis> | undefined;
  const validTrack = (track: unknown) => {
    if (!track || typeof track !== "object") return false;
    const row = track as Partial<Track>;
    return typeof row.id === "number" && typeof row.time === "string" && typeof row.seconds === "number" &&
      typeof row.artist === "string" && typeof row.title === "string";
  };
  return typeof item.id === "string" && typeof item.url === "string" && typeof item.playlistName === "string" &&
    typeof item.savedAt === "number" && Number.isFinite(item.savedAt) && item.savedAt > 0 && item.savedAt < Date.now() + 86_400_000 &&
    Boolean(videoValue) && typeof videoValue?.title === "string" && typeof videoValue?.channel === "string" &&
    typeof videoValue?.thumbnail === "string" && typeof videoValue?.source === "string" && Array.isArray(videoValue?.tracks) &&
    Array.isArray(item.tracks) && item.tracks.length > 0 && item.tracks.every(validTrack) &&
    (item.remixResults === undefined || (Array.isArray(item.remixResults) && item.remixResults.every(isStoredRemixResult)));
}

function isAcousticJob(value: unknown): value is AcousticJob {
  if (!value || typeof value !== "object") return false;
  const job = value as Partial<AcousticJob>;
  return typeof job.id === "string" && ACOUSTIC_JOB_ID_PATTERN.test(job.id) && typeof job.url === "string" && job.url.length > 0 &&
    typeof job.createdAt === "number" && Number.isFinite(job.createdAt) && job.createdAt > 0 &&
    (job.status === "queued" || job.status === "processing" || job.status === "paused");
}

function acousticTracks(value: unknown): VideoAnalysis["tracks"] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const candidate = item as Partial<Track>;
    const artist = typeof candidate.artist === "string" ? candidate.artist.trim() : "";
    const title = typeof candidate.title === "string" ? candidate.title.trim() : "";
    if (!artist || !title) return [];
    const seconds = typeof candidate.seconds === "number" && Number.isFinite(candidate.seconds) && candidate.seconds >= 0
      ? Math.round(candidate.seconds)
      : 0;
    return [{
      time: typeof candidate.time === "string" && candidate.time.trim() ? candidate.time.trim() : durationLabel(seconds),
      seconds,
      artist,
      title,
    }];
  });
}

export default function Home() {
  const [videoUrl, setVideoUrl] = useState("");
  const [manualText, setManualText] = useState("");
  const [showManual, setShowManual] = useState(false);
  const [inputMode, setInputMode] = useState<"video" | "manual">("video");
  const [manualOrder, setManualOrder] = useState<"artist-title" | "title-artist">("artist-title");
  const [tracks, setTracks] = useState<Track[]>([]);
  const [resultFilter,setResultFilter]=useState<"final"|"review"|"all">("final");
  const [video, setVideo] = useState<VideoAnalysis | null>(null);
  const [playlistName, setPlaylistName] = useState("");
  const [busy, setBusy] = useState<"extract" | "match" | "remixes" | "spotify" | "spotify-import" | "acoustic" | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [analysisProblem, setAnalysisProblem] = useState<AnalysisProblem | null>(null);
  const [acousticConfig, setAcousticConfig] = useState<AcousticConfig | null>(null);
  const [acousticJob, setAcousticJob] = useState<AcousticJob | null>(null);
  const [acousticPolling, setAcousticPolling] = useState(false);
  const [recentSets, setRecentSets] = useState<RecentSet[]>([]);
  const [activeRecentId, setActiveRecentId] = useState<string | null>(null);
  const [exportOpen, setExportOpen] = useState(false);
  const [spotify, setSpotify] = useState<{ connected: boolean; csrfToken?: string } | null>(null);
  const [spotifyResult, setSpotifyResult] = useState<{ url: string; matched: number; added: number } | null>(null);
  const [remixResults, setRemixResults] = useState<RemixBatchTrackResult[]>([]);
  const [remixProgress, setRemixProgress] = useState<RemixProgress | null>(null);
  const [ftpRemoteText, setFtpRemoteText] = useState("");
  const [ftpCandidates, setFtpCandidates] = useState<FtpRemoteCandidate[]>([]);
  const [ftpSelectedIds, setFtpSelectedIds] = useState<string[]>([]);
  const [ftpRejected, setFtpRejected] = useState(0);
  const [ftpProtocol, setFtpProtocol] = useState<FileTransferProtocol>("ftp");
  const [ftpHost, setFtpHost] = useState("pool.dj-compilations.com");
  const [ftpPort, setFtpPort] = useState("21");
  const [ftpUsername, setFtpUsername] = useState("");
  const [ftpRemoteRoot, setFtpRemoteRoot] = useState("/AUDIO");
  const [ftpLocalRoot, setFtpLocalRoot] = useState("");
  const importedSpotify = useRef(false);
  const manualInput = useRef<HTMLTextAreaElement>(null);

  const selected = useMemo(() => tracks.filter((track) => track.selected), [tracks]);
  const needsReview=(track:Track)=>Boolean(track.recognitionReview&&!track.recognitionApproved)||track.status==="review";
  const visibleTracks=tracks.filter(t=>resultFilter==="all" || (resultFilter==="review" ? needsReview(t) : !needsReview(t)));
  const matched = useMemo(
    () => uniqueDeezerMatches(selected),
    [selected],
  );
  const deemixPayload = useMemo(
    () => matched.map((track) => `https://www.deezer.com/track/${track.deezer.id}`).join(";"),
    [matched],
  );
  const djCompilationsPayload = useMemo(
    () => djCompilationsBatch(selected),
    [selected],
  );
  const ftpSearchPattern = useMemo(() => fileZillaSearchPattern(selected), [selected]);
  const ftpSelectedCandidates = useMemo(
    () => ftpCandidates.filter((candidate) => ftpSelectedIds.includes(candidate.id)),
    [ftpCandidates, ftpSelectedIds],
  );
  const totalDuration = useMemo(
    () => matched.reduce((total, track) => total + track.deezer.duration, 0),
    [matched],
  );
  const currentRemixResults = useMemo(
    () => validRemixResultsForTracks(tracks, remixResults),
    [remixResults, tracks],
  );
  const remixVersionCount = useMemo(
    () => currentRemixResults.reduce((total, result) => total + result.versions.length, 0),
    [currentRemixResults],
  );
  const remixByClientId = useMemo(
    () => new Map(currentRemixResults.map((result) => [result.clientId, result])),
    [currentRemixResults],
  );
  const hasPartialPublicCredits = Boolean(
    video && (video.coverage?.status === "partial" || video.source === "youtube-credits"),
  );
  const canUseAcousticFallback = Boolean(
    analysisProblem?.code && ACOUSTIC_FALLBACK_CODES.has(analysisProblem.code),
  );
  const openVideoHref = useMemo(() => externalVideoHref(videoUrl), [videoUrl]);

  function notify(message: string, kind: Notice["kind"] = "success") {
    setNotice({ kind, message });
  }

  function persistRecentSets(items: RecentSet[]) {
    try {
      window.localStorage.setItem(RECENT_SETS_KEY, JSON.stringify(items));
    } catch {
      // El historial local es una ayuda: la app sigue funcionando si el navegador lo bloquea.
    }
  }

  function persistAcousticJob(job: AcousticJob | null) {
    try {
      if (job) window.localStorage.setItem(ACOUSTIC_JOB_KEY, JSON.stringify(job));
      else window.localStorage.removeItem(ACOUSTIC_JOB_KEY);
    } catch {
      // El seguimiento puede continuar en esta pestaña aunque el almacenamiento esté bloqueado.
    }
  }

  function rememberAnalysis(analysis: VideoAnalysis, sourceTracks: Track[], url: string, name: string) {
    const cleanTracks = sourceTracks.map((track) => ({
      ...track,
      deezer: undefined,
      selected: true,
      status: "idle" as const,
    }));
    const recent: RecentSet = {
      id: typeof crypto.randomUUID === "function" ? crypto.randomUUID() : `${Date.now()}-${analysis.title}`,
      savedAt: Date.now(),
      url,
      playlistName: name,
      video: analysis,
      tracks: cleanTracks,
    };
    setActiveRecentId(recent.id);
    setRecentSets((current) => {
      const next = [recent, ...current].slice(0, MAX_RECENT_SETS);
      persistRecentSets(next);
      return next;
    });
  }

  function restoreRecent(recent: RecentSet) {
    if (busy || acousticPolling) return;
    const { tracks: restored, aliases } = restoreTrackState(recent.tracks);
    const restoredRemixResults = validRemixResultsForTracks(restored, recent.remixResults ?? [], aliases);
    setActiveRecentId(recent.id);
    setVideoUrl(recent.url);
    setManualText("");
    setShowManual(false);
    setInputMode("video");
    setVideo(recent.video);
    setTracks(restored);
    setPlaylistName(recent.playlistName);
    setAnalysisProblem(null);
    setSpotifyResult(null);
    setRemixResults(restoredRemixResults);
    setRemixProgress(null);
    setExportOpen(false);
    const ready = restored.filter((track) => Boolean(track.deezer)).length;
    notify(`${restored.length} pistas restauradas${ready ? ` · ${ready} coincidencias conservadas` : ""}.`, "info");
    window.setTimeout(() => document.querySelector("#results")?.scrollIntoView({ behavior: "smooth" }), 80);
  }

  function deleteRecent(id: string) {
    setActiveRecentId((current) => current === id ? null : current);
    setRecentSets((current) => {
      const next = current.filter((item) => item.id !== id);
      persistRecentSets(next);
      return next;
    });
  }

  /* eslint-disable react-hooks/set-state-in-effect -- One-time hydration from browser storage and URL parameters after SSR. */
  useEffect(() => {
    try {
      const saved = JSON.parse(window.localStorage.getItem(RECENT_SETS_KEY) || "[]");
      if (Array.isArray(saved)) {
        const valid = saved.filter(isRecentSet).slice(0, MAX_RECENT_SETS);
        setRecentSets(valid);
      }
    } catch {
      setRecentSets([]);
    }

    try {
      const savedJob = JSON.parse(window.localStorage.getItem(ACOUSTIC_JOB_KEY) || "null");
      if (isAcousticJob(savedJob)) {
        setAcousticJob(savedJob);
        setVideoUrl(savedJob.url);
        setAcousticPolling(savedJob.status !== "paused");
      }
    } catch {
      persistAcousticJob(null);
    }

    fetch("/api/mix/config", { cache: "no-store" })
      .then(async (response) => {
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) return { available: false, zeroCost: false };
        return { available: payload.available === true, zeroCost: payload.zeroCost === true };
      })
      .then(setAcousticConfig)
      .catch(() => setAcousticConfig({ available: false, zeroCost: false }));

    fetch("/api/connections/status", { cache: "no-store" })
      .then((response) => response.ok ? response.json() : null)
      .then((payload) => payload && setSpotify(payload.spotify))
      .catch(() => setSpotify({ connected: false }));

    const playlistId = new URLSearchParams(window.location.search).get("spotifyPlaylist");
    if (!playlistId || importedSpotify.current) return;
    importedSpotify.current = true;
    setActiveRecentId(null);
    setBusy("spotify-import");
    fetch(`/api/connections/spotify/import?playlistId=${encodeURIComponent(playlistId)}`, { cache: "no-store" })
      .then(async (response) => {
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error || "No se pudo importar la playlist de Spotify.");
        const imported: Track[] = payload.tracks.map((track: { artist: string; title: string }, index: number) => ({
          id: index + 1,
          time: "--:--",
          seconds: 0,
          artist: track.artist,
          title: track.title,
          selected: true,
          status: "idle" as const,
        }));
        const analysis: VideoAnalysis = { title: payload.playlist.name, channel: "Spotify", thumbnail: "", source: "spotify", tracks: imported };
        setVideo(analysis);
        setTracks(imported);
        setPlaylistName(payload.playlist.name.slice(0, 72));
        setAnalysisProblem(null);
        setRemixResults([]);
        setRemixProgress(null);
        rememberAnalysis(analysis, imported, "", payload.playlist.name.slice(0, 72));
        notify(`${imported.length} canciones importadas desde Spotify. Buscando coincidencias en Deezer…`, "info");
        window.history.replaceState({}, "", "/sets");
        return matchOnDeezer(imported);
      })
      .catch((cause) => notify(cause instanceof Error ? cause.message : "No se pudo importar Spotify.", "error"))
      .finally(() => setBusy(null));
    // La importación desde URL y el historial se inicializan una sola vez al montar esta pantalla.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  /* eslint-enable react-hooks/set-state-in-effect */

  useEffect(() => {
    if (!activeRecentId || !video || !tracks.length) return;
    const timer = window.setTimeout(() => {
      setRecentSets((current) => {
        const index = current.findIndex((item) => item.id === activeRecentId);
        if (index < 0) return current;
        const updated: RecentSet = {
          ...current[index],
          savedAt: Date.now(),
          playlistName,
          video,
          tracks,
          remixResults: currentRemixResults,
        };
        const next = [updated, ...current.filter((_, itemIndex) => itemIndex !== index)].slice(0, MAX_RECENT_SETS);
        persistRecentSets(next);
        return next;
      });
    }, 350);
    return () => window.clearTimeout(timer);
  }, [activeRecentId, currentRemixResults, playlistName, tracks, video]);

  useEffect(() => {
    if (!acousticJob || !acousticPolling) return;

    let stopped = false;
    let timer: number | undefined;
    let consecutiveFailures = 0;
    let pollCount = 0;
    const controller = new AbortController();

    const pauseTracking = (message: string) => {
      setAcousticJob((current) => {
        if (!current || current.id !== acousticJob.id) return current;
        const paused: AcousticJob = { ...current, status: "paused", message };
        persistAcousticJob(paused);
        return paused;
      });
      setAcousticPolling(false);
      notify(message, "info");
    };

    const schedule = (delay: number) => {
      if (!stopped) timer = window.setTimeout(() => void poll(), delay);
    };

    const poll = async () => {
      try {
        const response = await fetch(`/api/mix/status?id=${encodeURIComponent(acousticJob.id)}`, {
          cache: "no-store",
          signal: controller.signal,
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
          if (response.status >= 500 && response.status !== 503) {
            throw new Error(payload.error || "No pudimos consultar el avance del análisis.");
          }
          stopped = true;
          persistAcousticJob(null);
          setAcousticJob(null);
          setAcousticPolling(false);
          const message = typeof payload.error === "string" && payload.error.trim()
            ? payload.error
            : "No pudimos continuar el análisis acústico.";
          setAnalysisProblem({ message, code: typeof payload.code === "string" ? payload.code : "AUDIO_STATUS_FAILED", retryable: false, canPaste: true });
          notify(message, "error");
          return;
        }

        const status = typeof payload.status === "string"
          ? payload.status
          : payload.state === 1
            ? "ready"
            : payload.state === 0
              ? "processing"
              : payload.state === -1
                ? "no-results"
                : "error";

        if (status === "ready") {
          const recognized = acousticTracks(payload.tracks);
          if (!recognized.length) {
            stopped = true;
            persistAcousticJob(null);
            setAcousticJob(null);
            setAcousticPolling(false);
            const message = "El análisis terminó, pero no entregó canciones reconocibles.";
            setAnalysisProblem({ message, code: "AUDIO_NO_RESULTS", retryable: false, canPaste: true });
            notify(message, "error");
            return;
          }
          stopped = true;
          if (timer) window.clearTimeout(timer);
          persistAcousticJob(null);
          setAcousticJob(null);
          setAcousticPolling(false);
          const scanName = typeof payload.name === "string" && payload.name.trim()
            ? payload.name.trim()
            : "Mix reconocido por audio";
          await finishAnalysis({
            title: scanName,
            channel: "Reconocimiento acústico",
            thumbnail: "",
            source: "acrcloud-audio",
            tracks: recognized,
          }, acousticJob.url, `${recognized.length} pistas identificadas por audio. Buscando coincidencias en Deezer…`);
          return;
        }

        if (status === "no-results" || status === "error") {
          stopped = true;
          persistAcousticJob(null);
          setAcousticJob(null);
          setAcousticPolling(false);
          const message = typeof payload.message === "string" && payload.message.trim()
            ? payload.message
            : status === "no-results"
              ? "El análisis terminó sin identificar canciones con suficiente seguridad."
              : "El motor acústico no pudo completar este análisis.";
          setAnalysisProblem({ message, code: status === "no-results" ? "AUDIO_NO_RESULTS" : "AUDIO_ANALYSIS_FAILED", retryable: false, canPaste: true });
          notify(message, "error");
          return;
        }

        consecutiveFailures = 0;
        pollCount += 1;
        const progress = typeof payload.progress === "number" && Number.isFinite(payload.progress)
          ? Math.max(0, Math.min(100, Math.round(payload.progress)))
          : undefined;
        setAcousticJob((current) => {
          if (!current || current.id !== acousticJob.id) return current;
          const updated: AcousticJob = {
            ...current,
            status: "processing",
            progress,
            message: typeof payload.message === "string" ? payload.message : undefined,
          };
          persistAcousticJob(updated);
          return updated;
        });
        schedule(Math.min(4_000 + pollCount * 2_000, 30_000));
      } catch {
        if (stopped || controller.signal.aborted) return;
        consecutiveFailures += 1;
        if (consecutiveFailures >= 4) {
          pauseTracking("El seguimiento quedó pausado por un problema de conexión. Puedes reanudarlo sin iniciar otro análisis.");
          return;
        }
        schedule(Math.min(3_000 * 2 ** (consecutiveFailures - 1), 20_000));
      }
    };

    schedule(700);
    return () => {
      stopped = true;
      controller.abort();
      if (timer) window.clearTimeout(timer);
    };
    // El identificador es la identidad estable del trabajo; los cambios de progreso no deben reiniciar el sondeo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [acousticJob?.id, acousticPolling]);

  async function matchOnDeezer(sourceTracks: Track[]) {
    if (!sourceTracks.length) return;
    setBusy("match");
    const toSearch=sourceTracks.filter(t=>!t.deezerApproved || !t.deezer);
    setTracks(sourceTracks.map((track) => track.deezerApproved && track.deezer ? track : ({ ...track, status: "searching" })));

    try {
      const resolvedResults: Array<{
        clientId: number;
        match: DeezerMatch | null;
        alternatives?: DeezerMatch[];
        searchedQueries?: string[];
      }> = [];
      for (let index = 0; index < toSearch.length; index += 50) {
        const response = await fetch("/api/deezer/search", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            queries: toSearch.slice(index, index + 50).map((track) => ({
              clientId: track.id,
              artist: track.artist,
              title: track.title,
            })),
          }),
        });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error || "No se pudo consultar Deezer");
        resolvedResults.push(...payload.results);
      }
      const byId = new Map(resolvedResults.map((item) => [item.clientId, item]));
      const resolved = sourceTracks.map((track) => {
        if(track.deezerApproved && track.deezer) return track;
        const result = byId.get(track.id);
        const deezer = result?.match || undefined;
        return {
          ...track,
          deezer,
          deezerAlternatives: (result?.alternatives ?? []).filter((candidate) => candidate.id !== deezer?.id),
          deezerSearchQueries: result?.searchedQueries ?? [],
          status: deezer ? (!deezerNeedsReview(deezer) ? "matched" : "review") : "missing",
        } as Track;
      });
      setTracks(resolved);
      const count = resolved.filter((track) => track.deezer).length;
      const ready=uniqueDeezerMatches(resolved.filter(t=>t.selected)).length;
      notify(`${count} de ${resolved.length} referencias encontradas en Deezer · ${ready} enlaces únicos listos. Las dudas del reconocimiento y las versiones por revisar quedan fuera del TXT.`, count ? "success" : "info");
    } catch (error) {
      setTracks(sourceTracks.map((track) => track.deezer ? track : ({ ...track, status: "missing" })));
      notify(error instanceof Error ? error.message : "No se pudo consultar Deezer", "error");
    } finally {
      setBusy(null);
    }
  }

  async function searchSelectedRemixes() {
    if (!selected.length) {
      notify("Selecciona al menos una canción para buscar versiones.", "error");
      return;
    }
    setBusy("remixes");
    setRemixResults([]);
    setRemixProgress({ done: 0, total: selected.length });
    const collected: RemixBatchTrackResult[] = [];
    try {
      for (let index = 0; index < selected.length; index += 10) {
        const batch = selected.slice(index, index + 10);
        try {
          const response = await fetch("/api/remix/batch-search", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              tracks: batch.map((track) => ({
                clientId: String(track.id),
                artist: track.artist,
                title: explorationTitle(track.title),
              })),
            }),
            signal: AbortSignal.timeout(55_000),
          });
          const payload = await response.json().catch(() => ({}));
          if (!response.ok || !Array.isArray(payload.tracks)) {
            throw new Error(payload.error || "No se pudo consultar este lote.");
          }
          const globalIndexByClientId = new Map(
            batch.map((track, batchIndex) => [String(track.id), index + batchIndex]),
          );
          collected.push(...payload.tracks.filter(isStoredRemixResult).map((result: RemixBatchTrackResult) => ({
            ...result,
            index: globalIndexByClientId.get(result.clientId) ?? index + result.index,
          })));
        } catch (cause) {
          const error = cause instanceof Error ? cause.message : "No se pudo completar esta búsqueda.";
          collected.push(...batch.map((track, batchIndex) => ({
            clientId: String(track.id),
            index: index + batchIndex,
            title: remixResultTitle(track),
            artist: remixResultArtist(track),
            status: "unavailable" as const,
            versions: [],
            sources: [],
            error,
          })));
        }
        setRemixResults(validRemixResultsForTracks(tracks, collected));
        setRemixProgress({ done: Math.min(index + batch.length, selected.length), total: selected.length });
      }
      const validCollected = validRemixResultsForTracks(tracks, collected);
      const found = validCollected.reduce((total, result) => total + result.versions.length, 0);
      const automaticUnavailable = validCollected.length > 0 && validCollected.every((result) => result.status === "not-configured");
      notify(
        automaticUnavailable
          ? "La búsqueda automática de remixes en SoundCloud y Bandcamp no está configurada. Preparé enlaces para buscar cada canción en esas fuentes. El reconocimiento del set y la búsqueda en Deezer funcionan por separado."
          : `${found} versiones automáticas encontradas para ${selected.length} canciones. Revisa siempre artista y versión.`,
        found ? "success" : "info",
      );
      window.setTimeout(() => document.querySelector("#remix-radar")?.scrollIntoView({ behavior: "smooth", block: "start" }), 80);
    } finally {
      setBusy(null);
      setRemixProgress(null);
    }
  }

  function exportRemixResults() {
    const rows = currentRemixResults.flatMap((result) => result.versions.map((version) => [
      result.artist,
      result.title,
      version.title,
      version.creator,
      version.kind,
      version.platform,
      version.match === "title-artist" ? "título + artista" : "revisar artista",
      version.url,
    ]));
    if (!rows.length) {
      notify("Todavía no hay enlaces automáticos para exportar.", "info");
      return;
    }
    const header = ["artista_buscado", "cancion_buscada", "version_encontrada", "creador", "tipo", "fuente", "coincidencia", "url"];
    saveFile(
      `${safeFileName(playlistName || "playlist")}-REMIXES.csv`,
      `\uFEFF${[header, ...rows].map((row) => row.map(escapeCsv).join(",")).join("\r\n")}`,
      "text/csv;charset=utf-8",
    );
    notify(`${rows.length} versiones exportadas a CSV.`);
  }

  async function finishAnalysis(analysis: VideoAnalysis, sourceUrl: string, message: string) {
    const previous=analysis.recognitionJob ? (video?.recognitionJob===analysis.recognitionJob ? tracks : recentSets.find(s=>s.video.recognitionJob===analysis.recognitionJob)?.tracks ?? []) : [];
    const previousBySong=new Map(previous.map(t=>[songKey(t),t]));
    const nextTracks: Track[] = analysis.tracks.map((track, index) => {
      const prior=previousBySong.get(songKey(track));
      return ({
      ...track,
      id: index + 1,
      selected: prior?.selectionTouched ? prior.selected : !track.recognitionReview,
      selectionTouched:prior?.selectionTouched,
      recognitionApproved:prior?.recognitionApproved,
      ...(prior?.deezerApproved && prior.deezer ? {deezer:prior.deezer,deezerApproved:true,status:"matched" as const} : {status:"idle" as const}),
    });});
    setVideo(analysis);
    setVideoUrl(sourceUrl);
    setTracks(nextTracks);
    const nextPlaylistName = analysis.title.slice(0, 72);
    setPlaylistName(nextPlaylistName);
    setAnalysisProblem(null);
    setSpotifyResult(null);
    setRemixResults([]);
    setRemixProgress(null);
    setExportOpen(false);
    rememberAnalysis(analysis, nextTracks, sourceUrl, nextPlaylistName);
    notify(message, "success");
    await matchOnDeezer(nextTracks);
    window.setTimeout(() => document.querySelector("#results")?.scrollIntoView({ behavior: "smooth" }), 80);
  }

  async function startAcousticAnalysis() {
    if (!acousticConfig?.available || !acousticConfig.zeroCost) {
      notify("El motor acústico gratuito todavía no está activado.", "info");
      return;
    }
    if (!videoUrl.trim()) {
      notify("Pega el enlace del mix antes de iniciar el análisis de audio.", "error");
      return;
    }
    if (acousticJob) {
      notify("Ya hay un análisis acústico en seguimiento. Puedes reanudarlo sin crear otro.", "info");
      return;
    }

    setBusy("acoustic");
    try {
      const response = await fetch("/api/mix/start", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url: videoUrl.trim() }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "No se pudo iniciar el análisis acústico.");
      const id = typeof payload.id === "string" ? payload.id.trim() : "";
      if (!ACOUSTIC_JOB_ID_PATTERN.test(id)) throw new Error("El motor acústico no entregó un identificador de seguimiento válido.");
      const job: AcousticJob = {
        id,
        url: typeof payload.canonicalUrl === "string" && payload.canonicalUrl.trim() ? payload.canonicalUrl.trim() : videoUrl.trim(),
        createdAt: Date.now(),
        status: "queued",
      };
      persistAcousticJob(job);
      setAcousticJob(job);
      setAcousticPolling(true);
      setAnalysisProblem(null);
      notify("Análisis acústico iniciado con la prueba gratuita. No se activó ningún pago.", "info");
    } catch (cause) {
      notify(cause instanceof Error ? cause.message : "No se pudo iniciar el análisis acústico.", "error");
    } finally {
      setBusy(null);
    }
  }

  function pauseAcousticPolling() {
    if (!acousticJob) return;
    const paused: AcousticJob = {
      ...acousticJob,
      status: "paused",
      message: "Seguimiento pausado en este navegador. El análisis remoto no fue eliminado.",
    };
    persistAcousticJob(paused);
    setAcousticJob(paused);
    setAcousticPolling(false);
    notify(paused.message || "Seguimiento pausado.", "info");
  }

  function resumeAcousticPolling() {
    if (!acousticJob) return;
    const resumed: AcousticJob = { ...acousticJob, status: "processing", message: undefined };
    persistAcousticJob(resumed);
    setAcousticJob(resumed);
    setAcousticPolling(true);
    notify("Seguimiento reanudado. No se inició un análisis nuevo.", "info");
  }

  async function analyzeVideo(forceVideo = false) {
    const useManual = !forceVideo && inputMode === "manual" && Boolean(manualText.trim());
    if (!videoUrl.trim() && !useManual) {
      notify(showManual ? "Pega un enlace de video o una lista de canciones." : "Pega un enlace de video para comenzar.", "error");
      return;
    }

    setActiveRecentId(null);
    setBusy("extract");
    setAnalysisProblem(null);
    setVideo(null);
    setTracks([]);
    setPlaylistName("");
    setSpotifyResult(null);
    setRemixResults([]);
    setRemixProgress(null);
    setExportOpen(false);
    try {
      let analysis: VideoAnalysis;
      if (useManual) {
        const parsed = parseTracklist(manualText, manualOrder);
        if (!parsed.length) throw new Error("No pude leer pistas en el texto pegado.");
        analysis = {
          title: "Tracklist importado",
          channel: "Importación manual",
          thumbnail: "",
          source: "manual",
          tracks: parsed,
        };
      } else {
        const response = await fetch("/api/video", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ url: videoUrl.trim() }),
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new VideoAnalysisFailure({
            message: payload.error || "No se pudo analizar el video.",
            code: typeof payload.code === "string" ? payload.code : undefined,
            retryable: Boolean(payload.retryable),
            canPaste: payload.canPaste !== false,
          });
        }
        analysis = payload;
      }

      await finishAnalysis(
        analysis,
        useManual ? "" : videoUrl.trim(),
        analysis.coverage?.status === "partial" || analysis.source === "youtube-credits"
          ? `YouTube publicó ${analysis.tracks.length} créditos. Son una cobertura parcial; el mix completo requiere análisis de audio.`
          : `${analysis.tracks.length} referencias extraídas ${useManual ? "de la lista" : "del video"}.`,
      );
    } catch (cause) {
      if (cause instanceof VideoAnalysisFailure) {
        setAnalysisProblem(cause.problem);
        notify(cause.problem.message, "error");
        if (cause.problem.canPaste) {
          setShowManual(true);
          window.setTimeout(() => manualInput.current?.focus(), 80);
        }
      } else {
        const message = cause instanceof Error ? cause.message : "No se pudo analizar el video";
        notify(message, "error");
        if (!useManual) {
          setAnalysisProblem({ message, code: "VIDEO_REQUEST_FAILED", retryable: true, canPaste: true });
          setShowManual(true);
          window.setTimeout(() => manualInput.current?.focus(), 80);
        }
      }
    } finally {
      setBusy(null);
    }
  }

  async function loadSample() {
    if (busy || acousticPolling) return;
    const sampleTracks = SAMPLE_TRACKS.map((track) => ({ ...track, deezer: undefined, status: "idle" as const }));
    setActiveRecentId(null);
    setVideoUrl(SAMPLE_VIDEO);
    setShowManual(false);
    setInputMode("video");
    setVideo(SAMPLE_META);
    setTracks(sampleTracks);
    setPlaylistName("Afro Bros · LatinVillage Set");
    setAnalysisProblem(null);
    setSpotifyResult(null);
    setRemixResults([]);
    setRemixProgress(null);
    setExportOpen(false);
    rememberAnalysis(SAMPLE_META, sampleTracks, SAMPLE_VIDEO, "Afro Bros · LatinVillage Set");
    notify("Ejemplo cargado de forma manual. Buscando coincidencias en Deezer…", "info");
    await matchOnDeezer(sampleTracks);
    window.setTimeout(() => document.querySelector("#results")?.scrollIntoView({ behavior: "smooth" }), 80);
  }

  function toggleTrack(id: number) {
    if (busy === "remixes") return;
    setTracks((current) => current.map((track) => track.id === id ? { ...track, selected: !track.selected, selectionTouched:true } : track));
  }

  function removeTrack(id: number) {
    if (busy === "remixes") return;
    const nextTracks = tracks.filter((track) => track.id !== id);
    setTracks(nextTracks);
    setRemixResults((current) => validRemixResultsForTracks(
      nextTracks,
      current.filter((result) => result.clientId !== String(id)),
    ));
  }

  function swapTrack(id: number) {
    if (busy === "remixes") return;
    const nextTracks = tracks.map((track) => track.id === id ? {
      ...track,
      artist: track.title,
      title: track.artist,
      deezer: undefined,
      deezerAlternatives: undefined,
      deezerSearchQueries: undefined,
      status: "idle" as const,
    } : track);
    setTracks(nextTracks);
    setRemixResults((current) => validRemixResultsForTracks(
      nextTracks,
      current.filter((result) => result.clientId !== String(id)),
    ));
    notify("Artista y título corregidos. Pulsa Buscar nuevamente para actualizar Deezer.", "info");
  }

  function acceptMatch(id: number) {
    setTracks((current) => current.map((track) => track.id === id && track.deezer ? { ...track, status: "matched", deezerApproved:true } : track));
    notify("Versión de Deezer guardada. Si el reconocimiento está pendiente, revísalo antes de incluir el enlace.");
  }

  function chooseDeezerAlternative(id: number, candidate: DeezerMatch) {
    setTracks((current) => current.map((track) => {
      if (track.id !== id) return track;
      const alternatives = [track.deezer, ...(track.deezerAlternatives ?? [])]
        .filter((match): match is DeezerMatch => Boolean(match) && match?.id !== candidate.id);
      return { ...track, deezer: candidate, deezerAlternatives: alternatives, status: "matched", deezerApproved:true };
    }));
    notify("Alternativa de Deezer guardada; se conservará al actualizar este set.");
  }

  async function copyText(value: string, message: string) {
    try {
      await navigator.clipboard.writeText(value);
      notify(message);
    } catch {
      notify("No se pudo copiar. Usa la descarga TXT como alternativa.", "error");
    }
  }

  function exportFtpSearchManifest() {
    if (!selected.length) {
      notify("Selecciona al menos una canción para preparar la búsqueda FTP.", "error");
      return;
    }
    const job = {
      kind: "trackhunt.search-job",
      version: 1,
      jobId: createLocalJobId("search"),
      createdAt: new Date().toISOString(),
      playlist: playlistName || video?.title || "TrackHunt",
      source: videoUrl.trim() || null,
      tracks: selected.map((track) => ({
        id: String(track.id),
        time: track.time,
        artist: track.artist,
        title: track.title,
        query: djCompilationsQuery(track),
        queries: musicSearchQueries(track).map((row) => ({ query: row.query, strategy: row.strategy })),
      })),
    };
    saveFile(
      `${safeFileName(playlistName || "playlist")}-BUSQUEDA.trackhuntjob`,
      `${JSON.stringify(job, null, 2)}\n`,
      "application/json;charset=utf-8",
    );
    notify(`Manifiesto creado con ${selected.length} canciones. No contiene credenciales.`, "success");
  }

  function parseFtpResults(value = ftpRemoteText) {
    const limitProblem = ftpListingLimitProblem(value);
    if (limitProblem) {
      notify(limitProblem, "error");
      return;
    }
    const parsed = parseRemoteListing(value);
    setFtpCandidates(parsed.candidates);
    setFtpSelectedIds([]);
    setFtpRejected(parsed.rejected);
    if (!parsed.candidates.length) {
      notify("No encontré rutas válidas. Pega una ruta FTP completa por línea, por ejemplo /AUDIO/2026/archivo.mp3.", "error");
      return;
    }
    notify(`${parsed.candidates.length} archivos listos para revisar${parsed.rejected ? ` · ${parsed.rejected} líneas omitidas` : ""}.`, "info");
  }

  async function importFtpResults(event: ChangeEvent<HTMLInputElement>) {
    const input = event.currentTarget;
    const file = input.files?.[0];
    if (!file) return;
    if (file.size > MAX_FTP_LIST_BYTES) {
      notify("El listado supera 2 MB. Exporta solamente los resultados de esta búsqueda.", "error");
      input.value = "";
      return;
    }
    try {
      const value = await file.text();
      const limitProblem = ftpListingLimitProblem(value);
      if (limitProblem) {
        notify(limitProblem, "error");
        return;
      }
      setFtpRemoteText(value);
      parseFtpResults(value);
    } catch {
      notify("No pude leer ese archivo. Usa TXT, TSV o pega las rutas directamente.", "error");
    } finally {
      input.value = "";
    }
  }

  function toggleFtpCandidate(id: string) {
    setFtpSelectedIds((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  }

  function normalizedFtpRoot(value: string) {
    const trimmed = value.trim();
    return trimmed.length > 1 ? trimmed.replace(/\/+$/, "") : trimmed;
  }

  function buildFtpQueueInput(): FileZillaQueueInput {
    const localRoot = normalizedFtpRoot(ftpLocalRoot);
    const remoteRoot = normalizedFtpRoot(ftpRemoteRoot);
    const names = uniqueLocalNames(ftpSelectedCandidates);
    return {
      connection: {
        profileId: "trackhunt-filezilla",
        label: `TrackHunt · ${ftpHost.trim()}`,
        protocol: ftpProtocol,
        host: ftpHost.trim(),
        port: Number(ftpPort),
        username: ftpUsername.trim(),
        remoteRoot,
      },
      localRoot,
      files: ftpSelectedCandidates.map((candidate, index) => ({
        id: `file-${index + 1}`,
        remoteDirectory: candidate.remoteDirectory,
        remoteName: candidate.remoteName,
        localFile: localRoot === "/" ? `/${names[index]}` : `${localRoot}/${names[index]}`,
        ...(candidate.sizeBytes === undefined ? {} : { sizeBytes: candidate.sizeBytes }),
      })),
    };
  }

  function exportFileZillaQueue(format: "xml" | "trackhuntjob") {
    try {
      const queue = buildFtpQueueInput();
      const safeName = safeFileName(playlistName || "playlist");
      if (format === "xml") {
        const xml = generateFileZillaQueueXml(queue);
        saveFile(`${safeName}-FILEZILLA.xml`, xml, "application/xml;charset=utf-8");
        notify(`${queue.files.length} archivos preparados. Antes de importar, confirma que “Procesar cola” esté desactivado. El XML no la activa por sí mismo; luego tú decides cuándo iniciarla.`, "success");
      } else {
        const manifest = generateTrackHuntJob({ ...queue, jobId: createLocalJobId("download") });
        saveFile(`${safeName}-DESCARGA.trackhuntjob`, manifest, "application/json;charset=utf-8");
        notify(`Manifiesto de descarga creado con ${queue.files.length} archivos y sin contraseña.`, "success");
      }
    } catch (cause) {
      notify(cause instanceof Error ? cause.message : "Revisa los datos FTP antes de crear la cola.", "error");
    }
  }

  function exportList(format: "csv" | "m3u" | "json" | "txt" | "djcomp") {
    const safeName = safeFileName(playlistName || "playlist");
    if (format === "csv") {
      const header = ["timestamp", "artista_original", "track_original", "artista_deezer", "track_deezer", "url_deezer", "apariciones", "revision"];
      const rows = selected.map((track) => [
        track.time, track.artist, track.title, track.deezer?.artist ?? "", track.deezer?.title ?? "", uniqueDeezerMatches([track]).length ? `https://www.deezer.com/track/${track.deezer!.id}` : "", (track.occurrences??[track.seconds]).map(shazamTime).join(" | "), needsReview(track)?"por revisar":"sin revisión pendiente",
      ]);
      saveFile(`${safeName}.csv`, [header, ...rows].map((row) => row.map(escapeCsv).join(",")).join("\n"), "text/csv;charset=utf-8");
    } else if (format === "m3u") {
      const lines = ["#EXTM3U", ...matched.flatMap((track) => [
        `#EXTINF:${track.deezer.duration},${track.deezer.artist} - ${track.deezer.title}`,
        track.deezer.link,
      ])];
      saveFile(`${safeName}.m3u`, lines.join("\n"), "audio/x-mpegurl;charset=utf-8");
    } else if (format === "json") {
      saveFile(`${safeName}.json`, JSON.stringify({ name: playlistName, source: videoUrl, tracks: selected }, null, 2), "application/json");
    } else if (format === "djcomp") {
      saveFile(`${safeName}-DJ-COMPILATIONS-BUSQUEDAS.txt`, djCompilationsPayload, "text/plain;charset=utf-8");
    } else {
      saveFile(`${safeName}-DEEZER-ENLACES.txt`, deemixPayload, "text/plain;charset=utf-8");
    }
    setExportOpen(false);
    notify(`Lista exportada en ${format.toUpperCase()}`);
  }

  async function createOnSpotify() {
    if (!spotify?.connected || !spotify.csrfToken || !selected.length) return;
    setBusy("spotify"); setSpotifyResult(null); setNotice(null);
    try {
      const response = await fetch("/api/connections/spotify/create-playlist", {
        method: "POST",
        headers: { "content-type": "application/json", "x-trackhunt-csrf": spotify.csrfToken },
        body: JSON.stringify({ name: playlistName, tracks: selected.map((track) => ({ artist: track.artist, title: track.title })) }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "No se pudo crear la playlist en Spotify.");
      setSpotifyResult({ url: payload.playlist.url, matched: payload.matched, added: payload.added });
      notify(`Playlist privada creada en Spotify: ${payload.added} canciones añadidas de ${selected.length}.`);
    } catch (cause) { notify(cause instanceof Error ? cause.message : "No se pudo crear la playlist en Spotify.", "error"); }
    finally { setBusy(null); }
  }

  return (
    <main>


      <section className="hero" id="top">
        <div className="hero-copy-block">
          <div className="eyebrow"><span /> VIDEO / PLAYLIST → TRACKLIST → FUENTES</div>
          <h1>CONVIERTE UN SET<br />EN UNA <em>PLAYLIST.</em></h1>
          <p>
            Recupera una playlist o los créditos públicos de un video, encuentra las canciones en Deezer,
            agrupa las canciones repetidas y copia sus enlaces de Deezer sin duplicados.
          </p>
        </div>

        <div className="analyzer-card">
          <ShazamScanner disabled={busy !== null || acousticPolling} onImport={async (snapshot) => {
            setVideoUrl("");
            await finishAnalysis(shazamAnalysis(snapshot), snapshot.sourceURL??"", `${shazamAnalysis(snapshot).tracks.length} canciones agrupadas con tus correcciones. Buscando enlaces de Deezer…`);
          }} />
          <label htmlFor="video-url">ENLACE DEL VIDEO O PLAYLIST</label>
          <div className="url-line">
            <span>▶</span>
            <input
              id="video-url"
              value={videoUrl}
              onChange={(event) => {
                setVideoUrl(event.target.value);
                setInputMode("video");
                setAnalysisProblem(null);
              }}
              placeholder="https://youtube.com/watch?v=...&list=..."
            />
          </div>
          <div className="sets-actions">
            <button className="manual-toggle" type="button" onClick={() => setShowManual((value) => {
              const next = !value;
              setInputMode(next ? "manual" : "video");
              return next;
            })}>
              {showManual ? "− Ocultar tracklist manual" : "+ Pegar tracklist o transcripción"}
            </button>
            <button className="sample-btn" type="button" onClick={() => void loadSample()} disabled={busy !== null || acousticPolling}>
              PROBAR CON UN EJEMPLO
            </button>
          </div>
          {showManual && (
            <div className="manual-entry">
              <div className="manual-order" role="group" aria-label="Orden de la tracklist pegada">
                <span>ORDEN DE CADA LÍNEA</span>
                <button type="button" aria-pressed={manualOrder === "artist-title"} onClick={() => setManualOrder("artist-title")}>ARTISTA — CANCIÓN</button>
                <button type="button" aria-pressed={manualOrder === "title-artist"} onClick={() => setManualOrder("title-artist")}>CANCIÓN — ARTISTA</button>
              </div>
              <textarea
                ref={manualInput}
                value={manualText}
                onChange={(event) => {
                  setManualText(event.target.value);
                  setInputMode("manual");
                  setAnalysisProblem(null);
                }}
                placeholder={manualOrder === "artist-title" ? "00:00 Artista — Canción" : "00:00 Canción — Artista"}
                aria-label="Tracklist manual"
              />
            </div>
          )}
          {analysisProblem && (
            <div className="analysis-problem" role="alert">
              <strong>No pudimos leer este video.</strong>
              <p>{analysisProblem.message}</p>
              {analysisProblem.code && <small>Código: {analysisProblem.code}</small>}
              <div className="analysis-problem-actions">
                {analysisProblem.code === "AUTH_REQUIRED" && (
                  <a href="/signin-with-chatgpt?return_to=%2Fsets" target="_top">INICIAR SESIÓN CON CHATGPT</a>
                )}
                {analysisProblem.retryable && <button type="button" onClick={() => void analyzeVideo(true)} disabled={busy !== null || acousticPolling}>REINTENTAR AHORA</button>}
                {analysisProblem.canPaste && <button type="button" onClick={() => {
                  setShowManual(true);
                  setInputMode("manual");
                  window.setTimeout(() => manualInput.current?.focus(), 50);
                }}>PEGAR TRACKLIST</button>}
                {openVideoHref && <a href={openVideoHref} target="_blank" rel="noopener noreferrer">ABRIR EN YOUTUBE ↗</a>}
              </div>
            </div>
          )}
          {(canUseAcousticFallback || hasPartialPublicCredits || acousticJob) && (
            <div className="analysis-problem" aria-live="polite">
              {acousticJob ? (
                <>
                  <strong>{acousticJob.status === "paused" ? "Seguimiento acústico pausado" : "Analizando el audio del mix"}</strong>
                  <p>
                    {acousticJob.status === "paused"
                      ? acousticJob.message
                      : acousticJob.progress !== undefined
                        ? `Procesando · ${acousticJob.progress}% completado.`
                        : acousticJob.status === "queued"
                          ? "El análisis está en cola. Puedes dejar esta página abierta; también se recupera al volver."
                          : acousticJob.message || "Buscando cambios de canción y coincidencias en el mix completo…"}
                  </p>
                  <small>Trabajo: {acousticJob.id.slice(0, 12)}… · No se inició ningún pago.</small>
                  <div className="analysis-problem-actions">
                    {acousticPolling
                      ? <button type="button" onClick={pauseAcousticPolling}>DETENER SEGUIMIENTO</button>
                      : <button type="button" onClick={resumeAcousticPolling}>REANUDAR SEGUIMIENTO</button>}
                  </div>
                </>
              ) : acousticConfig === null ? (
                <>
                  <strong>Comprobando motor acústico</strong>
                  <p>Estamos verificando si la prueba gratuita está disponible.</p>
                </>
              ) : acousticConfig.available && acousticConfig.zeroCost ? (
                <>
                  <strong>{hasPartialPublicCredits
                    ? "Los créditos de YouTube son parciales"
                    : analysisProblem?.code === "NO_PUBLIC_TRACKLIST"
                      ? "El video no publica una tracklist"
                      : "YouTube no respondió; el análisis acústico sigue disponible"}</strong>
                  <p>{hasPartialPublicCredits
                    ? `YouTube publicó ${tracks.length} canciones, pero no garantiza que sean todo el set. Analiza el audio completo para encontrar los demás cambios de canción.`
                    : analysisProblem?.code === "NO_PUBLIC_TRACKLIST"
                      ? "Escucha el mix completo para identificar canciones aunque no estén escritas. Esta acción usa solamente el cupo gratuito configurado: no añade tarjeta, suscripción ni cobro automático."
                      : "La lectura de datos públicos de YouTube falló, pero no necesitas volver a empezar. TrackHunt puede enviar el enlace directamente al motor acústico para identificar las canciones del mix completo."}</p>
                  <small>ACRCloud solo recibe y procesa el enlace para analizar su audio después de que pulses este botón.</small>
                  <div className="analysis-problem-actions">
                    <button type="button" onClick={() => void startAcousticAnalysis()} disabled={busy !== null}>
                      {busy === "acoustic" ? "INICIANDO ANÁLISIS…" : "ANALIZAR AUDIO DEL MIX · PRUEBA GRATUITA"}
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <strong>{hasPartialPublicCredits ? "Lista parcial: falta escuchar el mix completo" : "El análisis acústico no está conectado en esta instalación"}</strong>
                  <p>{hasPartialPublicCredits
                    ? `YouTube solo entregó ${tracks.length} créditos públicos. TrackHunt no los contará como una tracklist completa. Falta conectar el motor acústico gratuito; mientras tanto puedes pegar una tracklist para continuar.`
                    : canUseAcousticFallback
                      ? "El enlace sigue siendo utilizable, pero esta instalación no tiene acceso al motor acústico. Abre la versión publicada de TrackHunt o pega una tracklist manual."
                      : "TrackHunt ya tiene preparado el flujo. Falta conectar una prueba gratuita compatible en el servidor; mientras tanto puedes pegar la tracklist manual sin pagar nada."}</p>
                  {hasPartialPublicCredits && (
                    <div className="analysis-problem-actions">
                      <button type="button" onClick={() => {
                        setShowManual(true);
                        setInputMode("manual");
                        window.setTimeout(() => manualInput.current?.focus(), 50);
                      }}>COMPLETAR CON TRACKLIST</button>
                    </div>
                  )}
                </>
              )}
            </div>
          )}
          <button className="primary-btn" type="button" onClick={() => void analyzeVideo()} disabled={busy !== null || acousticPolling}>
            {busy === "extract" ? "EXTRAYENDO…" : busy === "match" ? "BUSCANDO EN DEEZER…" : busy === "remixes" ? "BUSCANDO REMIXES…" : busy === "acoustic" ? "INICIANDO ANÁLISIS…" : inputMode === "manual" && manualText.trim() ? "ANALIZAR TRACKLIST" : "ANALIZAR VIDEO"}
            <span>↗</span>
          </button>
          <small>TrackHunt no descarga audio en tu dispositivo. El análisis acústico externo solo empieza cuando tú pulsas el botón y lo autorizas.</small>
        </div>
      </section>

      <section className="workflow" id="workflow">
        <div><b>01</b><strong>EXTRAER</strong><span>Créditos, lista pegada o análisis acústico autorizado</span></div>
        <div><b>02</b><strong>ENCONTRAR</strong><span>Deezer y buscadores de remixes por pista</span></div>
        <div><b>03</b><strong>REVISAR</strong><span>Selección y control de versiones</span></div>
        <div><b>04</b><strong>EXPORTAR</strong><span>Una línea con todos los enlaces para Deemix</span></div>
      </section>

      {recentSets.length > 0 && (
        <section className="recent-sets" aria-labelledby="recent-sets-title">
          <div>
            <div className="section-kicker">/ PROYECTOS LOCALES</div>
            <h2 id="recent-sets-title">CONTINÚA DONDE QUEDASTE</h2>
            <p>Conserva selección y coincidencias en este dispositivo. Ningún proyecto se abre automáticamente.</p>
          </div>
          <div className="recent-grid">
            {recentSets.map((recent) => (
              <article className="recent-card" key={recent.id}>
                <small>{new Intl.DateTimeFormat("es-CL", { dateStyle: "medium", timeStyle: "short" }).format(recent.savedAt)}</small>
                <strong>{recent.video.title}</strong>
                <span>
                  {recent.video.channel} · {recent.tracks.length} pistas · {recent.tracks.filter((track) => Boolean(track.deezer)).length} listas
                </span>
                <div className="recent-card-actions">
                  <button type="button" onClick={() => restoreRecent(recent)} disabled={busy !== null || acousticPolling}>RESTAURAR</button>
                  <button type="button" onClick={() => deleteRecent(recent.id)} disabled={busy !== null} aria-label={`Borrar ${recent.video.title} del historial`}>BORRAR</button>
                </div>
              </article>
            ))}
          </div>
        </section>
      )}

      <section className="results" id="results">
        {video ? (
          <>
        <div className="section-heading">
          <div>
            <div className="section-kicker">/ RESULTADO DEL ANÁLISIS</div>
            <h2>{video.title}</h2>
            <p>{video.channel} · {tracks.length} referencias · Fuente: {video.source.replaceAll("-", " ")}</p>
          </div>
          <div className="result-stats">
            <div><strong>{tracks.length}</strong><span>{hasPartialPublicCredits ? "PUBLICADAS" : "EXTRAÍDAS"}</span></div>
            <div><strong>{matched.length}</strong><span>LISTAS</span></div>
            <div><strong>{remixVersionCount}</strong><span>VERSIONES</span></div>
            <div><strong>{Math.round(totalDuration / 60)}</strong><span>MINUTOS</span></div>
          </div>
        </div>

        {hasPartialPublicCredits && (
          <div className="coverage-warning" role="status">
            <div>
              <strong>COBERTURA PARCIAL · NO ES UN LÍMITE DE 10</strong>
              <p>{video.coverage?.message || `YouTube publicó ${tracks.length} créditos musicales, pero pueden faltar canciones del mix.`}</p>
            </div>
            <button type="button" onClick={() => document.querySelector(".analyzer-card")?.scrollIntoView({ behavior: "smooth", block: "center" })}>
              COMPLETAR EL MIX ↑
            </button>
          </div>
        )}

        <div className="workspace">
          <div className="track-panel">
            <div className="track-toolbar">
              <label className="select-all">
                <input
                  type="checkbox"
                  checked={tracks.length > 0 && tracks.every((track) => track.selected)}
                  disabled={busy === "match" || busy === "remixes"}
                  onChange={(event) => setTracks((current) => current.map((track) => ({ ...track, selectionTouched:true, selected: event.target.checked && !(track.recognitionReview&&!track.recognitionApproved) })))}
                />
                SELECCIONAR TODO
              </label>
              <div className="track-toolbar-actions">
                <button type="button" onClick={() => matchOnDeezer(tracks)} disabled={busy !== null}>↻ Buscar nuevamente en Deezer</button>
                <button type="button" onClick={() => void searchSelectedRemixes()} disabled={busy !== null || !selected.length}>
                  {busy === "remixes" && remixProgress
                    ? `Buscando remixes · ${remixProgress.done}/${remixProgress.total}`
                    : `⌕ Buscar remixes · ${selected.length}`}
                </button>
              </div>
            </div>
            <p className="match-note">Una fila por canción y versión. Las apariciones originales siguen guardadas en la línea de tiempo. Los candidatos con una sola muestra y las versiones dudosas quedan en «Por revisar», fuera de los enlaces listos. Encontrar una canción en Deezer no confirma su identidad acústica.</p>
            <div className="track-source-actions" aria-label="Filtrar lista final">
              <button type="button" aria-pressed={resultFilter==="final"} onClick={()=>setResultFilter("final")}>LISTA FINAL · {tracks.filter(t=>!needsReview(t)).length}</button>
              <button type="button" aria-pressed={resultFilter==="review"} onClick={()=>setResultFilter("review")}>POR REVISAR · {tracks.filter(needsReview).length}</button>
              <button type="button" aria-pressed={resultFilter==="all"} onClick={()=>setResultFilter("all")}>TODAS · {tracks.length}</button>
            </div>

            <div className="track-head" aria-hidden="true">
              <span>TIEMPO / ORIGINAL</span><span>COINCIDENCIA DEEZER</span><span>ESTADO</span><span />
            </div>
            <div className="track-list">
              {visibleTracks.map((track) => (
                <article className={`track-row ${track.selected ? "selected" : ""}`} key={track.id}>
                  <div className="original-track">
                    <input type="checkbox" checked={track.selected} disabled={busy === "match" || busy === "remixes"} onChange={() => toggleTrack(track.id)} aria-label={`Seleccionar ${track.title}`} />
                    <span className="timestamp">{track.time}</span>
                    <div><small>{track.artist}</small><strong>{track.title}</strong>
                    {track.occurrences && <small>{track.evidenceHits} muestras · Apariciones: {track.occurrences.map(shazamTime).join(" · ")}</small>}
                    {track.recognitionReview && !track.recognitionApproved && <div className="review-message"><p>RECONOCIMIENTO POR REVISAR · {track.recognitionReview}</p><button type="button" onClick={()=>setTracks(current=>current.map(t=>t.id===track.id?{...t,recognitionApproved:true,selected:true,selectionTouched:true}:t))}>INCLUIR ESTE CANDIDATO EN MI LISTA</button></div>}
                    <div className="track-source-actions">
                      <a className="remix-track-search" href={remixSearchHref(track)} target="_blank" rel="noopener noreferrer">REMIXES · BUSCAR EN FUENTES ↗</a>
                      {remixByClientId.has(String(track.id)) && <a className="remix-track-found" href="#remix-radar">
                        RADAR · {remixByClientId.get(String(track.id))?.versions.length ?? 0} ENCONTRADAS ↓
                      </a>}
                      <a
                        className="djcomp-track-search"
                        href={DJ_COMPILATIONS_HOME}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={() => void copyText(djCompilationsQueries(track).join("\n"), `${djCompilationsQueries(track).length} consultas copiadas para DJ Compilations`)}
                      >DJ COMPILATIONS · COPIAR VARIANTES + ABRIR</a>
                      <button className="swap-track" type="button" onClick={() => swapTrack(track.id)} disabled={busy === "match" || busy === "remixes"}>↔ ARTISTA / TÍTULO</button>
                    </div></div>
                  </div>
                  <div className="deezer-match">
                    {track.deezer ? (
                      <>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={track.deezer.cover} alt="" />
                        <div>
                          <small>{track.deezer.artist}</small>
                          <strong>{track.deezer.title}</strong>
                          <span>{track.deezer.album} · similitud de catálogo {Math.round(track.deezer.score * 100)}%</span>
                          <a href={`https://www.deezer.com/track/${track.deezer.id}`} target="_blank" rel="noreferrer">DEEZER ↗</a>
                          <button type="button" onClick={()=>void copyText(`https://www.deezer.com/track/${track.deezer!.id}`,"Enlace de Deezer copiado; verifica la versión si está pendiente.")}>COPIAR ENLACE</button>
                          {track.status === "review" && <button className="accept-match" type="button" onClick={() => acceptMatch(track.id)}>✓ USAR ESTE MATCH</button>}
                          {Boolean(track.deezerAlternatives?.length) && <details className="deezer-alternatives">
                            <summary>{track.deezerAlternatives?.length} alternativas encontradas</summary>
                            {track.deezerAlternatives?.map((candidate) => <button
                              type="button"
                              key={candidate.id}
                              onClick={() => chooseDeezerAlternative(track.id, candidate)}
                            >
                              <b>{candidate.artist}</b> — {candidate.title} <small>{Math.round(candidate.score * 100)}%</small>
                            </button>)}
                          </details>}
                        </div>
                        <a className="open-track" href={track.deezer.link} target="_blank" rel="noreferrer" aria-label={`Abrir ${track.deezer.title} en Deezer`}>↗</a>
                      </>
                    ) : (
                      <div className="no-match">
                        {track.status === "searching" ? "Buscando…" : "Sin coincidencia automática"}
                        {track.status === "missing" && Boolean(track.deezerSearchQueries?.length) && <details className="deezer-queries">
                          <summary>{track.deezerSearchQueries?.length} consultas probadas</summary>
                          {track.deezerSearchQueries?.map((query) => <span key={query}>{query}</span>)}
                        </details>}
                      </div>
                    )}
                  </div>
                  <span className={`status status-${track.status}`}>
                    {needsReview(track) ? "REVISAR" : track.status === "matched" ? "EN DEEZER" : track.status === "searching" ? "BUSCANDO" : track.status === "missing" ? "NO EN DEEZER" : "PENDIENTE"}
                  </span>
                  <button className="remove-track" type="button" onClick={() => removeTrack(track.id)} disabled={busy === "match" || busy === "remixes"} aria-label={`Quitar ${track.title}`}>×</button>
                </article>
              ))}
            </div>

            <section className="remix-radar" id="remix-radar" aria-labelledby="remix-radar-title">
              <div className="remix-radar-heading">
                <div>
                  <div className="section-kicker">/ RADAR DE VERSIONES · BÚSQUEDA POR LOTE</div>
                  <h3 id="remix-radar-title">UNA BÚSQUEDA.<br /><em>TODO EL SET.</em></h3>
                  <p>Consulta las conexiones automáticas disponibles y deja listas las búsquedas directas en YouTube, Beatport, Traxsource y DJ Compilations.</p>
                </div>
                <div className="remix-radar-stats">
                  <span><b>{currentRemixResults.length}</b> canciones revisadas</span>
                  <span><b>{remixVersionCount}</b> versiones automáticas</span>
                </div>
              </div>
              <div className="remix-radar-actions">
                <button type="button" onClick={() => void searchSelectedRemixes()} disabled={busy !== null || !selected.length}>
                  {busy === "remixes" && remixProgress
                    ? `BUSCANDO ${remixProgress.done} DE ${remixProgress.total}…`
                    : `BUSCAR ${selected.length} SELECCIONADAS`}
                </button>
                <button type="button" onClick={exportRemixResults} disabled={!remixVersionCount}>↓ EXPORTAR ENLACES CSV</button>
                <a href="/connections">VER CONEXIONES →</a>
              </div>
              {currentRemixResults.length ? (
                <div className="remix-batch-list">
                  {currentRemixResults.map((result) => {
                    const direct = remixDestinations({ artist: result.artist, title: result.title });
                    const statusLabel = result.status === "ok" ? "ENCONTRADAS" : result.status === "partial" ? "PARCIAL" : result.status === "not-configured" ? "CONEXIÓN PENDIENTE" : result.status === "unavailable" ? "NO DISPONIBLE" : result.status === "invalid" ? "REVISAR DATOS" : "SIN RESULTADOS";
                    return <details className="remix-batch-track" key={result.clientId}>
                      <summary>
                        <span>{String(result.index + 1).padStart(2, "0")}</span>
                        <div><small>{result.artist}</small><strong>{result.title}</strong></div>
                        <b className={`remix-batch-status status-${result.status}`}>{statusLabel}</b>
                        <em>{result.versions.length}</em>
                      </summary>
                      <div className="remix-batch-body">
                        {result.error && <p className="remix-batch-error">{result.error}</p>}
                        {result.sources.length > 0 && <div className="remix-source-grid">
                          {result.sources.map((source) => <a key={source.name} href={source.searchUrl} target="_blank" rel="noopener noreferrer">
                            <strong>{source.name} · {source.status === "ok" ? "consultada" : source.status === "not-configured" ? "pendiente" : source.status === "empty" ? "sin coincidencias" : "no disponible"}</strong>
                            <span>{source.message}</span>
                          </a>)}
                        </div>}
                        {result.versions.length > 0 ? <div className="remix-version-list">
                          {result.versions.map((version) => <a key={version.id} href={version.url} target="_blank" rel="noopener noreferrer">
                            <span>{version.platform} · {version.kind}</span>
                            <strong>{version.title}</strong>
                            <small>{version.creator} · {version.match === "title-artist" ? "título + artista" : "revisar artista"}</small>
                            <b>ABRIR ↗</b>
                          </a>)}
                        </div> : <p className="remix-batch-empty">No apareció una coincidencia automática. Eso no significa que la versión no exista: usa las búsquedas directas.</p>}
                        <div className="remix-direct-links">
                          {direct.map((destination) => <a key={destination.name} href={destination.url} target="_blank" rel="noopener noreferrer">{destination.name} ↗</a>)}
                          <a href={DJ_COMPILATIONS_HOME} target="_blank" rel="noopener noreferrer" onClick={() => void copyText(djCompilationsQuery(result), `Consulta copiada: ${djCompilationsQuery(result)}`)}>DJ COMPILATIONS · COPIAR + ABRIR ↗</a>
                        </div>
                      </div>
                    </details>;
                  })}
                </div>
              ) : <div className="remix-radar-empty">
                <strong>{busy === "remixes" ? "BUSCANDO EN LAS FUENTES…" : "RADAR LISTO"}</strong>
                <span>{busy === "remixes" && remixProgress ? `${remixProgress.done} de ${remixProgress.total} canciones revisadas.` : "Selecciona las canciones y pulsa Buscar remixes. Los resultados reales aparecerán aquí; las fuentes no conectadas se marcarán claramente."}</span>
              </div>}
            </section>
          </div>

          <aside className="playlist-builder" id="deemix-export">
            <div className="deezer-bars" aria-hidden="true"><i /><i /><i /><i /><i /><i /><i /><i /></div>
            <div className="section-kicker">/ ENLACES DE DEEZER · SIN DUPLICADOS</div>
            <p className="single-link-intro">Enlaces reales del catálogo, una vez por canción de Deezer. Copia todos o descarga el TXT; las coincidencias pendientes quedan aparte. Se conserva el formato separado por punto y coma.</p>
            <label htmlFor="playlist-name">NOMBRE DEL ARCHIVO</label>
            <input id="playlist-name" value={playlistName} onChange={(event) => setPlaylistName(event.target.value)} maxLength={80} />
            <div className="playlist-summary">
              <div><span>Seleccionadas</span><b>{selected.length}</b></div>
              <div><span>Listas para exportar</span><b>{matched.length}</b></div>
              <div><span>Duración</span><b>{durationLabel(totalDuration)}</b></div>
            </div>
            <label htmlFor="deemix-payload">ENLACES DE DEEZER · UNA SOLA LÍNEA</label>
            <textarea
              className="deemix-payload"
              id="deemix-payload"
              value={deemixPayload}
              readOnly
              onFocus={(event) => event.currentTarget.select()}
              placeholder="Analiza un video para generar los enlaces."
            />
            <button
              className="create-btn"
              type="button"
              onClick={() => copyText(deemixPayload, `${matched.length} enlaces únicos de Deezer copiados`)}
              disabled={!deemixPayload}
            >
              ⧉ COPIAR ENLACES DE DEEZER <span>↗</span>
            </button>
            <button
              className="deemix-download"
              type="button"
              onClick={() => exportList("txt")}
              disabled={!deemixPayload}
            >
              ↓ DESCARGAR TXT PARA PEGAR
            </button>
            <div className="djcomp-export">
              <strong>DJ COMPILATIONS · TU SUSCRIPCIÓN</strong>
              <p>Trackhunt prepara la búsqueda. Abre el pool con tu sesión, pega una consulta y confirma la versión antes de descargar.</p>
              {selected[0] ? <a
                href={DJ_COMPILATIONS_HOME}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => void copyText(djCompilationsQueries(selected[0]).join("\n"), `${djCompilationsQueries(selected[0]).length} variantes copiadas para la primera canción`)}
              >COPIAR VARIANTES DE LA PRIMERA Y ABRIR ↗</a> : <span>SELECCIONA AL MENOS UNA CANCIÓN</span>}
              <button type="button" onClick={() => exportList("djcomp")} disabled={!djCompilationsPayload}>↓ DESCARGAR LISTA DE BÚSQUEDAS</button>
              <a className="ftp-bridge-link" href="#ftp-filezilla">PREPARAR FTP / FILEZILLA ↓</a>
            </div>
            {spotify?.connected ? <button className="spotify-create" type="button" onClick={createOnSpotify} disabled={!selected.length || busy !== null}>
              {busy === "spotify" ? "CREANDO EN SPOTIFY…" : "♫ CREAR PLAYLIST PRIVADA EN SPOTIFY"}
            </button> : <a className="spotify-connect-link" href="/connections">Conectar Spotify para crear esta playlist →</a>}
            {spotifyResult && <a className="spotify-result" href={spotifyResult.url} target="_blank" rel="noopener noreferrer">✓ Abrir playlist en Spotify · {spotifyResult.added} canciones ↗</a>}
            <div className="export-wrap">
              <button className="export-btn" type="button" onClick={() => setExportOpen((value) => !value)}>MÁS FORMATOS</button>
              {exportOpen && (
                <div className="export-menu">
                  <button type="button" onClick={() => exportList("txt")}>TXT · Una línea con ;</button>
                  <button type="button" onClick={() => exportList("csv")}>CSV · Hoja de cálculo</button>
                  <button type="button" onClick={() => exportList("m3u")}>M3U · Reproductores</button>
                  <button type="button" onClick={() => exportList("json")}>JSON · Datos completos</button>
                  <button type="button" onClick={() => exportList("djcomp")}>TXT · Búsquedas DJ Compilations</button>
                </div>
              )}
            </div>
            <p>No necesitas entregar contraseñas a TrackHunt. Deemix usa los enlaces exportados; DJ Compilations se abre con tu sesión. La app prepara consultas, enlaces y archivos locales sin contraseña.</p>
          </aside>
        </div>

        <section className="ftp-bridge" id="ftp-filezilla" aria-labelledby="ftp-filezilla-title">
          <div className="ftp-bridge-heading">
            <div>
              <div className="section-kicker">/ PUENTE LOCAL · FTP + FILEZILLA</div>
              <h3 id="ftp-filezilla-title">ENCUENTRA LOS ARCHIVOS.<br /><em>TÚ CONFIRMAS LA COLA.</em></h3>
              <p>
                TrackHunt prepara la búsqueda, revisa las rutas que pegues y crea una cola importable.
                No entra a tu cuenta ni envía estos datos al servidor. El XML local contiene tu usuario y la ruta de destino, nunca tu contraseña.
              </p>
            </div>
            <span className="ftp-local-badge">TODO SE GENERA EN ESTE NAVEGADOR</span>
          </div>

          <div className="ftp-safety" role="note">
            <strong>IMPORTANTE</strong>
            <span>Antes de importar, confirma que “Procesar cola” esté desactivado. El XML no la activa por sí mismo; luego tú decides cuándo iniciarla.</span>
          </div>

          <div className="ftp-steps">
            <section className="ftp-step" aria-labelledby="ftp-step-search">
              <div className="ftp-step-number">01</div>
              <div className="ftp-step-copy">
                <h4 id="ftp-step-search">PREPARAR BÚSQUEDA</h4>
                <p>{selected.length} canciones seleccionadas. El patrón conserva artista, título y versión cuando están escritos.</p>
              </div>
              <div className="ftp-step-actions">
                <button type="button" onClick={exportFtpSearchManifest} disabled={!selected.length}>↓ MANIFIESTO .TRACKHUNTJOB</button>
                <button
                  type="button"
                  onClick={() => saveFile(`${safeFileName(playlistName || "playlist")}-FILEZILLA-BUSQUEDA.txt`, ftpSearchPattern, "text/plain;charset=utf-8")}
                  disabled={!ftpSearchPattern}
                >↓ DESCARGAR BÚSQUEDA</button>
              </div>
              <label htmlFor="ftp-search-pattern">PATRÓN PARA “COINCIDE CON EXPRESIÓN REGULAR”</label>
              <textarea
                id="ftp-search-pattern"
                className="ftp-code"
                value={ftpSearchPattern}
                readOnly
                onFocus={(event) => event.currentTarget.select()}
                placeholder="Selecciona canciones para crear el patrón."
              />
              <button
                className="ftp-primary-action"
                type="button"
                onClick={() => copyText(ftpSearchPattern, "Patrón copiado. En FileZilla usa Buscar archivos remotos → expresión regular.")}
                disabled={!ftpSearchPattern}
              >⧉ COPIAR PATRÓN PARA FILEZILLA</button>
              <small>En FileZilla abre Servidor → Buscar archivos remotos, elige “nombre de archivo” + “expresión regular” y desactiva “distinguir mayúsculas”.</small>
            </section>

            <section className="ftp-step" aria-labelledby="ftp-step-results">
              <div className="ftp-step-number">02</div>
              <div className="ftp-step-copy">
                <h4 id="ftp-step-results">PEGAR RESULTADOS</h4>
                <p>Copia las rutas completas encontradas. También puedes importar un TXT o TSV exportado localmente.</p>
              </div>
              <label htmlFor="ftp-remote-results">UNA RUTA COMPLETA POR LÍNEA</label>
              <textarea
                id="ftp-remote-results"
                className="ftp-remote-input"
                value={ftpRemoteText}
                onChange={(event) => {
                  const value = event.target.value;
                  const limitProblem = ftpListingLimitProblem(value);
                  if (limitProblem) {
                    notify(limitProblem, "error");
                    return;
                  }
                  setFtpRemoteText(value);
                  setFtpCandidates([]);
                  setFtpSelectedIds([]);
                  setFtpRejected(0);
                }}
                placeholder={"/AUDIO/2026/10/Artista - Tema (DJ Remix).mp3\n/AUDIO/2025/08/Artista - Tema (Extended).flac"}
              />
              <div className="ftp-import-actions">
                <label className="ftp-file-picker">
                  IMPORTAR TXT / TSV
                  <input type="file" accept=".txt,.tsv,text/plain,text/tab-separated-values" onChange={(event) => void importFtpResults(event)} />
                </label>
                <button type="button" onClick={() => parseFtpResults()} disabled={!ftpRemoteText.trim()}>REVISAR RUTAS</button>
              </div>
              {(ftpCandidates.length > 0 || ftpRejected > 0) && (
                <div className="ftp-result-summary" aria-live="polite">
                  <span><b>{ftpCandidates.length}</b> válidas</span>
                  <span><b>{ftpSelectedCandidates.length}</b> elegidas</span>
                  {ftpRejected > 0 && <span className="ftp-rejected"><b>{ftpRejected}</b> omitidas</span>}
                  {ftpCandidates.length > 0 && (
                    <div className="ftp-selection-controls">
                      <button
                        type="button"
                        onClick={() => setFtpSelectedIds(ftpCandidates.map((candidate) => candidate.id))}
                        disabled={ftpSelectedCandidates.length === ftpCandidates.length}
                      >✓ SELECCIONAR TODOS</button>
                      <button
                        type="button"
                        onClick={() => setFtpSelectedIds([])}
                        disabled={!ftpSelectedCandidates.length}
                      >× LIMPIAR SELECCIÓN</button>
                    </div>
                  )}
                </div>
              )}
              {ftpCandidates.length > 0 ? (
                <div className="ftp-candidate-list">
                  {ftpCandidates.map((candidate) => {
                    const suggestion = suggestedTrack(candidate, selected);
                    return (
                      <label className="ftp-candidate" key={candidate.id} aria-label={`Seleccionar ${candidate.remoteName}`}>
                        <input
                          type="checkbox"
                          checked={ftpSelectedIds.includes(candidate.id)}
                          onChange={() => toggleFtpCandidate(candidate.id)}
                          aria-label={`Añadir ${candidate.remoteName} a la cola de FileZilla`}
                        />
                        <span>
                          <strong>{candidate.remoteName}</strong>
                          <small>{candidate.remoteDirectory}</small>
                          <em>{suggestion ? `POSIBLE: ${suggestion.track.artist} — ${suggestion.track.title}` : "REVISAR VERSIÓN MANUALMENTE"}</em>
                        </span>
                      </label>
                    );
                  })}
                </div>
              ) : (
                <div className="ftp-candidate-empty">Aquí aparecerán los archivos. TrackHunt no elige ni descarga ninguno sin tu confirmación.</div>
              )}
            </section>

            <section className="ftp-step ftp-step-queue" aria-labelledby="ftp-step-queue">
              <div className="ftp-step-number">03</div>
              <div className="ftp-step-copy">
                <h4 id="ftp-step-queue">CREAR COLA</h4>
                <p>Completa solo los datos visibles en FileZilla. El XML local contiene el usuario y la ruta de destino; la contraseña nunca forma parte del archivo.</p>
              </div>
              <div className="ftp-fields">
                <label htmlFor="ftp-protocol">CONEXIÓN
                  <select
                    id="ftp-protocol"
                    value={ftpProtocol}
                    onChange={(event) => {
                      const protocol = event.target.value as FileTransferProtocol;
                      setFtpProtocol(protocol);
                      setFtpPort(protocol === "sftp" ? "22" : protocol === "ftps-implicit" ? "990" : "21");
                    }}
                  >
                    <option value="ftp">FTP · TLS AUTOMÁTICO</option>
                    <option value="ftps-explicit">FTPS · TLS EXPLÍCITO</option>
                    <option value="ftps-implicit">FTPS · TLS IMPLÍCITO</option>
                    <option value="sftp">SFTP</option>
                    <option value="ftp-insecure">FTP SIN CIFRADO</option>
                  </select>
                </label>
                <label htmlFor="ftp-host">SERVIDOR
                  <input id="ftp-host" value={ftpHost} onChange={(event) => setFtpHost(event.target.value)} spellCheck={false} />
                </label>
                <label className="ftp-port-field" htmlFor="ftp-port">PUERTO
                  <input id="ftp-port" inputMode="numeric" value={ftpPort} onChange={(event) => setFtpPort(event.target.value.replace(/\D/g, "").slice(0, 5))} />
                </label>
                <label htmlFor="ftp-username">USUARIO
                  <input id="ftp-username" value={ftpUsername} onChange={(event) => setFtpUsername(event.target.value)} autoComplete="username" placeholder="Tu usuario del pool" />
                </label>
                <label htmlFor="ftp-remote-root">CARPETA REMOTA BASE
                  <input id="ftp-remote-root" value={ftpRemoteRoot} onChange={(event) => setFtpRemoteRoot(event.target.value)} spellCheck={false} />
                </label>
                <label className="ftp-local-root-field" htmlFor="ftp-local-root">CARPETA DE DESTINO EN TU MAC
                  <input id="ftp-local-root" value={ftpLocalRoot} onChange={(event) => setFtpLocalRoot(event.target.value)} spellCheck={false} placeholder="/Volumes/MUSICA/TrackHunt" />
                </label>
              </div>
              {ftpProtocol === "ftp-insecure" && (
                <div className="ftp-insecure-warning" role="alert">
                  <strong>FTP SIN CIFRADO</strong>
                  <span>El usuario, la contraseña y los archivos pueden viajar visibles por la red. Úsalo solamente si tu servidor no admite FTP con TLS ni SFTP.</span>
                </div>
              )}
              <div className="ftp-queue-actions">
                <button
                  className="ftp-primary-action"
                  type="button"
                  onClick={() => exportFileZillaQueue("xml")}
                  disabled={!ftpSelectedCandidates.length || !ftpHost.trim() || !ftpUsername.trim() || !ftpLocalRoot.trim()}
                >↓ DESCARGAR XML PARA FILEZILLA</button>
                <button
                  type="button"
                  onClick={() => exportFileZillaQueue("trackhuntjob")}
                  disabled={!ftpSelectedCandidates.length || !ftpHost.trim() || !ftpUsername.trim() || !ftpLocalRoot.trim()}
                >↓ GUARDAR COLA .TRACKHUNTJOB</button>
              </div>
              <small>Antes de importar, confirma que “Procesar cola” esté desactivado. Luego usa FileZilla → Archivo → Importar → Cola, revisa los archivos y decide cuándo iniciar la cola.</small>
            </section>
          </div>
        </section>
          </>
        ) : (
          <div className="result-empty">
            <div className="section-kicker">/ RESULTADO DEL ANÁLISIS</div>
            <h2>NINGÚN SET CARGADO</h2>
            <p>Pega un enlace arriba o abre la entrada manual. El ejemplo solo se carga cuando tú lo eliges.</p>
            <div className="sets-actions">
              <a href="#top">PEGAR UN ENLACE ↑</a>
              <button className="sample-btn" type="button" onClick={() => void loadSample()} disabled={busy !== null || acousticPolling}>PROBAR CON UN EJEMPLO</button>
            </div>
          </div>
        )}
      </section>

      <section className="legal-strip" id="legal">
        <strong>DESCARGA RESPONSABLE</strong>
        <p>La aplicación exporta metadatos, enlaces y consultas. No automatiza el catálogo privado de DJ Compilations ni guarda credenciales; las búsquedas y descargas se confirman dentro de tu cuenta.</p>
        <span>NO AUDIO RIPPING</span>
      </section>

      <footer>
        <div className="brand"><span className="brand-mark">TH</span><span>TRACKHUNT · SETS</span></div>
        <p>HECHO PARA DJS, SELECTORES Y CRATE DIGGERS.</p>
        <a href="https://developers.deezer.com/guidelines" target="_blank" rel="noreferrer">REGLAS DE DEEZER ↗</a>
      </footer>

      {notice && (
        <div
          className={`toast toast-${notice.kind}`}
          role={notice.kind === "error" ? "alert" : "status"}
        >
          <span>{notice.kind === "error" ? "!" : notice.kind === "info" ? "i" : "✓"}</span>
          <p>{notice.message}</p>
          <button className="toast-close" type="button" onClick={() => setNotice(null)} aria-label="Cerrar aviso">×</button>
        </div>
      )}
    </main>
  );
}
