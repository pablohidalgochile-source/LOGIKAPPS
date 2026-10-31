import type { ParsedSubtitles, QualityIssue, SubtitleBlock } from "@/types";
import { isValidSrtTime, isValidVttTime, timeToMs } from "@/lib/subtitles/timeUtils";

/** Heuristic: translations this many times longer than the source are flagged. */
const LENGTH_RATIO_LIMIT = 1.8;
/** Absolute character ceiling before we warn about readability. */
const ABS_LENGTH_LIMIT = 90;

/**
 * Run automatic quality checks over the (possibly translated) subtitles.
 * Covers untranslated / empty blocks, over-long translations, malformed
 * timestamps and numbering integrity.
 */
export function runQualityChecks(parsed: ParsedSubtitles): QualityIssue[] {
  const issues: QualityIssue[] = [];
  const content = parsed.blocks.filter((b) => !b.isMeta);
  const validTime = parsed.format === "vtt" ? isValidVttTime : isValidSrtTime;

  let lastIndex = 0;
  let indexBroken = false;

  for (const b of content) {
    const hasSource = b.originalText.trim() !== "";
    const hasTranslation = b.translatedText.trim() !== "";

    if (hasSource && !hasTranslation) {
      issues.push(issue("warning", "untranslated", `Bloque ${b.index}: sin traducir.`, b.index));
    } else if (hasSource && hasTranslation && looksUntranslated(b.originalText, b.translatedText)) {
      // Translation identical to the source despite carrying real words — likely
      // an untranslated line (or a proper noun that is fine to leave as-is).
      issues.push(
        issue("info", "echo", `Bloque ${b.index}: la traducción es idéntica al original.`, b.index)
      );
    }

    // A block whose source is empty but has stray non-text content.
    if (!hasSource && b.rawTiming && hasTranslation) {
      issues.push(
        issue("info", "empty-source", `Bloque ${b.index}: el original está vacío.`, b.index)
      );
    }

    if (hasTranslation) {
      checkLength(b, issues);
    }

    // Timestamp integrity.
    if (b.startTime && !validTime(b.startTime)) {
      issues.push(
        issue("error", "bad-timestamp", `Bloque ${b.index}: inicio mal formado (${b.startTime}).`, b.index)
      );
    }
    if (b.endTime && !validTime(b.endTime)) {
      issues.push(
        issue("error", "bad-timestamp", `Bloque ${b.index}: fin mal formado (${b.endTime}).`, b.index)
      );
    }
    const startMs = timeToMs(b.startTime);
    const endMs = timeToMs(b.endTime);
    if (startMs !== null && endMs !== null && endMs < startMs) {
      issues.push(
        issue("error", "reversed-time", `Bloque ${b.index}: el fin es anterior al inicio.`, b.index)
      );
    }

    // Numbering should be strictly increasing for SRT.
    if (parsed.format === "srt") {
      if (b.index <= lastIndex) indexBroken = true;
      lastIndex = b.index;
    }
  }

  if (indexBroken) {
    issues.push(
      issue("warning", "numbering", "La numeración de bloques no es estrictamente creciente.")
    );
  }

  const untranslated = content.filter(
    (b) => b.originalText.trim() !== "" && b.translatedText.trim() === ""
  ).length;
  if (untranslated === 0 && content.length > 0) {
    issues.push(issue("info", "complete", "Todos los bloques con texto están traducidos."));
  }

  return issues;
}

/** True when translation equals the source and the source carries real words. */
function looksUntranslated(source: string, translation: string): boolean {
  const norm = (s: string) =>
    s
      .replace(/<[^>]+>/g, "")
      .replace(/\{[^}]*\}/g, "")
      .replace(/\s+/g, " ")
      .trim()
      .toLowerCase();
  const src = norm(source);
  if (src.length < 2 || !/\p{L}/u.test(src)) return false;
  return src === norm(translation);
}

function checkLength(b: SubtitleBlock, issues: QualityIssue[]) {
  const srcLen = b.originalText.replace(/\s+/g, " ").trim().length;
  const dstLen = b.translatedText.replace(/\s+/g, " ").trim().length;
  if (dstLen > ABS_LENGTH_LIMIT && dstLen > srcLen * LENGTH_RATIO_LIMIT) {
    issues.push(
      issue(
        "warning",
        "too-long",
        `Bloque ${b.index}: la traducción es notablemente más larga que el original (${dstLen} vs ${srcLen} car.).`,
        b.index
      )
    );
  }
}

/** Confirm the translated set kept the same block count as the source. */
export function checkBlockCount(original: number, translated: number): QualityIssue | null {
  if (original !== translated) {
    return issue(
      "error",
      "count-mismatch",
      `La cantidad de bloques cambió: original ${original}, traducido ${translated}.`
    );
  }
  return null;
}

function issue(
  level: QualityIssue["level"],
  code: string,
  message: string,
  blockIndex?: number
): QualityIssue {
  return { level, code, message, blockIndex };
}
