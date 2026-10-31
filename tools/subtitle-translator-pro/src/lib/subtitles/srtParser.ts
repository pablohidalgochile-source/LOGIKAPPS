import type { ParsedSubtitles, SubtitleBlock } from "@/types";
import { isValidSrtTime, splitTimingLine } from "./timeUtils";

/**
 * Parse a SubRip (.srt) file into structured blocks.
 *
 * A block looks like:
 *   1
 *   00:00:01,000 --> 00:00:04,000
 *   Hello world
 *   (second line)
 *
 * Blocks are separated by one or more blank lines. Internal line breaks
 * within the text are preserved. Numbering and timing are kept verbatim.
 */
export function parseSrt(input: string): ParsedSubtitles {
  const warnings: string[] = [];
  // Normalise line endings, strip a leading BOM.
  const text = input.replace(/^﻿/, "").replace(/\r\n?/g, "\n");

  // Split into chunks on blank-line boundaries.
  const chunks = text.split(/\n[ \t]*\n/);
  const blocks: SubtitleBlock[] = [];
  let fallbackIndex = 0;

  for (const rawChunk of chunks) {
    const chunk = rawChunk.replace(/^\n+|\n+$/g, "");
    if (chunk.trim() === "") continue;

    const lines = chunk.split("\n");
    let cursor = 0;

    // Optional numeric index line.
    let index: number | null = null;
    if (/^\d+$/.test(lines[0].trim())) {
      index = parseInt(lines[0].trim(), 10);
      cursor = 1;
    }

    // Timing line.
    const timingLine = lines[cursor]?.trim() ?? "";
    const timing = splitTimingLine(timingLine);

    if (!timing) {
      warnings.push(
        `Bloque ${index ?? fallbackIndex + 1}: no se encontró una línea de tiempo válida; se conserva como texto.`
      );
      continue;
    }

    if (!isValidSrtTime(timing.start) || !isValidSrtTime(timing.end)) {
      warnings.push(
        `Bloque ${index ?? fallbackIndex + 1}: timestamp con formato inusual (${timingLine}).`
      );
    }

    cursor += 1;
    const textLines = lines.slice(cursor);
    const originalText = textLines.join("\n").replace(/\n+$/, "");

    fallbackIndex += 1;
    blocks.push({
      index: index ?? fallbackIndex,
      startTime: timing.start,
      endTime: timing.end,
      originalText,
      translatedText: "",
      rawTiming: timingLine,
      format: "srt",
    });
  }

  if (blocks.length === 0) {
    warnings.push("No se detectaron bloques de subtítulos en el archivo .srt.");
  }

  return {
    format: "srt",
    blocks,
    translatableCount: blocks.filter((b) => b.originalText.trim() !== "").length,
    warnings,
  };
}
