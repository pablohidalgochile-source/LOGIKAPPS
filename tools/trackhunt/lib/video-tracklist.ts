export type TrackReference = {
  time: string;
  seconds: number;
  artist: string;
  title: string;
};

export type PlaylistTrackMetadata = {
  title: string;
  ownerChannel?: string;
};

function safeMetadataText(value: string, maxLength = 300) {
  const withoutControls = [...value.normalize("NFC")]
    .map((character) => {
      const code = character.charCodeAt(0);
      return code <= 31 || code === 127 ? " " : character;
    })
    .join("");
  return withoutControls
    .replace(/[\u200b-\u200f\u202a-\u202e\u2060-\u206f\ufeff]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength)
    .trim();
}

function cleanPublishedVideoTitle(value: string) {
  let title = safeMetadataText(value);
  let previous = "";
  const publicationLabel = /\s*(?:\((?:official\s+(?:music\s+)?video|official\s+audio|lyric(?:s|\s+video)?|visuali[sz]er|audio)\)|\[(?:official\s+(?:music\s+)?video|official\s+audio|lyric(?:s|\s+video)?|visuali[sz]er|audio)\])\s*$/i;
  while (title && title !== previous) {
    previous = title;
    title = title.replace(publicationLabel, "").trim();
  }
  return dedupeRepeatedTitleSuffix(title);
}

/**
 * Turns one published playlist item into a conservative track reference.
 * We only infer the artist from an explicit “Artist — Title” name or from
 * YouTube's auto-generated “Artist - Topic” channel. A normal uploader is not
 * necessarily the performer, so ambiguous items stay clearly unidentified.
 */
export function trackFromPlaylistMetadata(metadata: PlaylistTrackMetadata): TrackReference | null {
  const publishedTitle = cleanPublishedVideoTitle(metadata.title);
  if (!publishedTitle || /^(?:private|deleted|unavailable)\s+video$/i.test(publishedTitle)) return null;

  const credit = splitCredit(publishedTitle);
  if (credit) {
    const artist = safeMetadataText(credit.artist, 180);
    const title = safeMetadataText(credit.title, 300);
    return artist && title ? { time: "--:--", seconds: 0, artist, title } : null;
  }

  const ownerChannel = safeMetadataText(metadata.ownerChannel ?? "", 180);
  const topicArtist = ownerChannel.match(/^(.+?)\s+-\s+Topic$/i)?.[1]?.trim() ?? "";
  return {
    time: "--:--",
    seconds: 0,
    artist: topicArtist || "Artista por identificar",
    title: publishedTitle,
  };
}

export function normalizeTrackText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\b(?:feat(?:uring)?|ft|official|video|audio|lyrics?)\b/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function dedupeRepeatedTitleSuffix(value: string) {
  let clean = value.trim();
  let previous = "";
  while (clean !== previous) {
    previous = clean;
    clean = clean.replace(/(\s+\(([^()]*)\))\s+\(\2\)$/i, "$1").trim();
  }
  return clean;
}

function words(value: string) {
  return new Set(normalizeTrackText(value).split(" ").filter((word) => word.length > 1));
}

function similarity(left: string, right: string) {
  const a = words(left);
  const b = words(right);
  if (!a.size || !b.size) return 0;
  let shared = 0;
  a.forEach((word) => { if (b.has(word)) shared += 1; });
  return (2 * shared) / (a.size + b.size);
}

function comparableTitle(value: string) {
  return value
    .replace(/\s*[([][^)\]]*\b(?:feat(?:uring)?|ft)\b[^)\]]*[)\]]/gi, " ")
    .replace(/[()[\]]/g, " ")
    .replace(/\s+(?:feat(?:uring)?|ft)\.?\s+.*$/i, " ")
    .replace(/\b(?:remix|re[- ]?drum|edit|intro|transition|blend|toneplay|bootleg|mashup|extended|rework|flip|vip|refix|dub)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function sameTimedCredit(left: TrackReference, right: TrackReference) {
  if ((left.time === "--:--") === (right.time === "--:--")) return false;
  const artistScore = similarity(left.artist, right.artist);
  const leftTitle = comparableTitle(left.title);
  const rightTitle = comparableTitle(right.title);
  const titleScore = similarity(leftTitle, rightTitle);
  const leftWords = words(leftTitle);
  const rightWords = words(rightTitle);
  const smaller = leftWords.size <= rightWords.size ? leftWords : rightWords;
  const larger = smaller === leftWords ? rightWords : leftWords;
  const containedTitle = smaller.size >= 2 && [...smaller].every((word) => larger.has(word));
  return artistScore >= .4 && ((containedTitle && titleScore >= .45) || (titleScore >= .5 && artistScore * .42 + titleScore * .58 >= .56));
}

function parseSeconds(value: string) {
  return value.split(":").map(Number).reduce((total, part) => total * 60 + part, 0);
}

export function splitCredit(value: string) {
  const clean = value
    .replace(/^\s*(?:[-•*]|\d+[.)])\s*/, "")
    .replace(/\s*(?:\([^)]*(?:official|video|audio)[^)]*\)|\[[^\]]*(?:official|video|audio)[^\]]*\])\s*$/i, "")
    .trim();
  const pieces = clean.split(/\s+(?:[-–—|])\s+/);
  if (pieces.length < 2) return null;
  const artist = pieces.shift()?.trim() ?? "";
  const title = pieces.join(" — ").trim();
  return artist && title ? { artist, title } : null;
}

export function tracksFromDescription(description: string) {
  const tracks: TrackReference[] = [];
  for (const rawLine of description.split(/\r?\n/)) {
    const line = rawLine.trim();
    const leading = line.match(/^\[?((?:\d{1,2}:)?\d{1,2}:\d{2})\]?\s*(?:[-–—|:]\s*)?(.*)$/);
    const trailing = line.match(/^(.*?)\s+(?:[-–—|]\s*)?\[?((?:\d{1,2}:)?\d{1,2}:\d{2})\]?$/);
    const time = leading?.[1] ?? trailing?.[2];
    const creditText = leading?.[2] ?? trailing?.[1];
    if (!time || !creditText) continue;
    const credit = splitCredit(creditText);
    if (!credit) continue;
    tracks.push({ time, seconds: parseSeconds(time), ...credit });
  }
  return tracks;
}

function orientationScore(track: TrackReference, credit: TrackReference, swapped: boolean) {
  const artist = swapped ? track.title : track.artist;
  const title = swapped ? track.artist : track.title;
  const artistScore = similarity(artist, credit.artist);
  const titleScore = similarity(title, credit.title);
  // A matching artist is the strongest orientation signal; titles in DJ sets often
  // include extra edit/remix wording that is absent from YouTube's music credit.
  return artistScore >= .55 && titleScore >= .35 ? artistScore * .62 + titleScore * .38 : 0;
}

const VERSION_DESCRIPTOR = /\b(?:remix|re[- ]?drum|edit|intro|transition|blend|toneplay|bootleg|mashup|rework|flip|vip|refix|dub|hype)\b/i;

function swapTitleFirstTrack(track: TrackReference) {
  const right = track.title.split(/\s+—\s+/).map((part) => part.trim()).filter(Boolean);
  if (right.length >= 2 && right.slice(0, -1).some((part) => VERSION_DESCRIPTOR.test(part))) {
    const artist = right.at(-1)!;
    const version = right.slice(0, -1).join(" — ");
    const base = normalizeTrackText(track.artist);
    const normalizedVersion = normalizeTrackText(version);
    const alreadyNamed = normalizedVersion && base.includes(normalizedVersion);
    return { ...track, artist, title: alreadyNamed ? track.artist : `${track.artist} (${version})` };
  }
  return { ...track, artist: track.title, title: track.artist };
}

export function parseTracklistText(text: string, order: "artist-title" | "title-artist" = "artist-title") {
  const tracks: TrackReference[] = [];
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || /^https?:\/\//i.test(line)) continue;
    const timeMatch = line.match(/^\[?((?:\d{1,2}:)?\d{1,2}:\d{2})\]?\s*(?:[-–—|:]\s*)?/);
    const time = timeMatch?.[1] ?? "--:--";
    const clean = line.replace(/^\[?(?:\d{1,2}:)?\d{1,2}:\d{2}\]?\s*(?:[-–—|:]\s*)?/, "").trim();
    const credit = splitCredit(clean);
    if (!credit) {
      if (clean) tracks.push({ time, seconds: time === "--:--" ? 0 : parseSeconds(time), artist: "Artista por identificar", title: clean });
      continue;
    }
    const track = { time, seconds: time === "--:--" ? 0 : parseSeconds(time), ...credit };
    tracks.push(order === "title-artist" ? swapTitleFirstTrack(track) : track);
  }
  return tracks;
}

/**
 * YouTube descriptions commonly use either “Artist — Title” or “Title — Artist”.
 * Music credits, when available, let us infer the convention for the whole list.
 */
export function orientDescriptionTracks(descriptionTracks: TrackReference[], creditTracks: TrackReference[]) {
  if (!descriptionTracks.length || !creditTracks.length) return descriptionTracks;
  let directEvidence = 0;
  let swappedEvidence = 0;
  const evidence = descriptionTracks.map((track) => {
    let direct = 0;
    let swapped = 0;
    for (const credit of creditTracks) {
      direct = Math.max(direct, orientationScore(track, credit, false));
      swapped = Math.max(swapped, orientationScore(track, credit, true));
    }
    directEvidence += direct;
    swappedEvidence += swapped;
    return { direct, swapped };
  });
  const globallySwapped = swappedEvidence > directEvidence + .35;
  return descriptionTracks.map((track, index) => {
    const row = evidence[index];
    const shouldSwap = row.swapped > row.direct + .08 || (row.direct === 0 && row.swapped === 0 && globallySwapped);
    return shouldSwap ? swapTitleFirstTrack(track) : track;
  });
}

export function uniqueTracks(...groups: TrackReference[][]) {
  const found = new Map<string, TrackReference>();
  for (const rawTrack of groups.flat()) {
    const track = { ...rawTrack, title: dedupeRepeatedTitleSuffix(rawTrack.title) };
    const key = `${normalizeTrackText(track.artist)}|${normalizeTrackText(track.title)}`;
    const previous = found.get(key);
    if (previous) {
      if (previous.time === "--:--" && track.time !== "--:--") found.set(key, track);
      continue;
    }
    const fuzzy = [...found.entries()].find(([, candidate]) => sameTimedCredit(candidate, track));
    if (fuzzy) {
      if (fuzzy[1].time === "--:--" && track.time !== "--:--") found.set(fuzzy[0], track);
      continue;
    }
    found.set(key, track);
  }
  return [...found.values()].sort((a, b) => {
    if (a.time === "--:--" && b.time !== "--:--") return 1;
    if (a.time !== "--:--" && b.time === "--:--") return -1;
    return a.seconds - b.seconds;
  });
}
