// Helpers for parsing / validating subtitle timestamps.

// SRT:  00:00:01,000 --> 00:00:04,000
// VTT:  00:00:01.000 --> 00:00:04.000  (hours optional: 00:01.000)
const SRT_TIME = /^\d{2}:\d{2}:\d{2},\d{3}$/;
const VTT_TIME = /^(\d{2}:)?\d{2}:\d{2}\.\d{3}$/;

export function isValidSrtTime(t: string): boolean {
  return SRT_TIME.test(t.trim());
}

export function isValidVttTime(t: string): boolean {
  return VTT_TIME.test(t.trim());
}

/**
 * Split a timing line "start --> end [settings]" into parts.
 * Returns null when the arrow separator is missing.
 */
export function splitTimingLine(
  line: string
): { start: string; end: string; settings: string } | null {
  const arrow = line.indexOf("-->");
  if (arrow === -1) return null;
  const start = line.slice(0, arrow).trim();
  const rest = line.slice(arrow + 3).trim();
  // rest may be "end" or "end setting1:value setting2:value"
  const firstSpace = rest.indexOf(" ");
  if (firstSpace === -1) {
    return { start, end: rest, settings: "" };
  }
  return {
    start,
    end: rest.slice(0, firstSpace).trim(),
    settings: rest.slice(firstSpace + 1).trim(),
  };
}

/** Convert any supported timestamp to milliseconds, or null if unparseable. */
export function timeToMs(t: string): number | null {
  const m = t.trim().match(/^(?:(\d+):)?(\d{2}):(\d{2})[.,](\d{3})$/);
  if (!m) return null;
  const h = m[1] ? parseInt(m[1], 10) : 0;
  const min = parseInt(m[2], 10);
  const sec = parseInt(m[3], 10);
  const ms = parseInt(m[4], 10);
  return ((h * 60 + min) * 60 + sec) * 1000 + ms;
}
