import type { ParsedSubtitles, SubtitleBlock } from "@/types";
import { isValidVttTime, splitTimingLine } from "./timeUtils";

/**
 * Parse a WebVTT (.vtt) file.
 *
 * Preserves the WEBVTT header (with any trailing metadata), NOTE / STYLE /
 * REGION blocks, cue identifiers and cue settings. Only the spoken cue text
 * is exposed for translation; everything else is carried through as meta.
 */
export function parseVtt(input: string): ParsedSubtitles {
  const warnings: string[] = [];
  const text = input.replace(/^﻿/, "").replace(/\r\n?/g, "\n");

  const chunks = text.split(/\n[ \t]*\n/);
  const blocks: SubtitleBlock[] = [];
  let cueIndex = 0;

  chunks.forEach((rawChunk, i) => {
    const chunk = rawChunk.replace(/^\n+|\n+$/g, "");
    if (chunk.trim() === "") return;

    const lines = chunk.split("\n");
    const firstLine = lines[0].trim();

    // WEBVTT header — must be the first chunk.
    if (i === 0 && /^WEBVTT/.test(firstLine)) {
      blocks.push(metaBlock(chunk));
      return;
    }

    // Structural blocks that are never translated.
    if (/^(NOTE|STYLE|REGION)\b/.test(firstLine)) {
      blocks.push(metaBlock(chunk));
      return;
    }

    // A cue: the timing line contains "-->". It may be preceded by a cue id.
    const timingLineIdx = lines.findIndex((l) => l.includes("-->"));
    if (timingLineIdx === -1) {
      // Unknown chunk — preserve verbatim rather than lose data.
      warnings.push(`Bloque ${i}: contenido sin timestamp; se conserva sin traducir.`);
      blocks.push(metaBlock(chunk));
      return;
    }

    const timingLine = lines[timingLineIdx].trim();
    const timing = splitTimingLine(timingLine);

    if (!timing) {
      blocks.push(metaBlock(chunk));
      return;
    }

    if (!isValidVttTime(timing.start) || !isValidVttTime(timing.end)) {
      warnings.push(`Cue con timestamp inusual (${timingLine}).`);
    }

    const textLines = lines.slice(timingLineIdx + 1);
    const originalText = textLines.join("\n").replace(/\n+$/, "");

    cueIndex += 1;
    blocks.push({
      index: cueIndex,
      startTime: timing.start,
      endTime: timing.end,
      originalText,
      translatedText: "",
      rawTiming: timingLine,
      format: "vtt",
      cueId: timingLineIdx > 0 ? lines[0].trim() : undefined,
      cueSettings: timing.settings || undefined,
    });
  });

  if (cueIndex === 0) {
    warnings.push("No se detectaron cues traducibles en el archivo .vtt.");
  }

  return {
    format: "vtt",
    blocks,
    translatableCount: blocks.filter((b) => !b.isMeta && b.originalText.trim() !== "").length,
    warnings,
  };
}

function metaBlock(raw: string): SubtitleBlock {
  return {
    index: 0,
    startTime: "",
    endTime: "",
    originalText: "",
    translatedText: "",
    rawTiming: "",
    format: "vtt",
    isMeta: true,
    metaRaw: raw,
  };
}
