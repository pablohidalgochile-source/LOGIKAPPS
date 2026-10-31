import type { SubtitleBlock } from "@/types";

/** Choose translated text, falling back to the original when untranslated. */
function outText(b: SubtitleBlock): string {
  return b.translatedText.trim() !== "" ? b.translatedText : b.originalText;
}

/** Rebuild a .srt file preserving original numbering, timings and line breaks. */
export function exportSrt(blocks: SubtitleBlock[]): string {
  const parts: string[] = [];
  for (const b of blocks) {
    if (b.isMeta) continue;
    parts.push(`${b.index}\n${b.rawTiming}\n${outText(b)}`);
  }
  return parts.join("\n\n") + "\n";
}

/** Rebuild a .vtt file, carrying header/notes/styles through untouched. */
export function exportVtt(blocks: SubtitleBlock[]): string {
  const parts: string[] = [];
  let hasHeader = false;

  for (const b of blocks) {
    if (b.isMeta) {
      const raw = (b.metaRaw ?? "").trimEnd();
      if (/^WEBVTT/.test(raw)) hasHeader = true;
      parts.push(raw);
      continue;
    }
    const idLine = b.cueId ? `${b.cueId}\n` : "";
    const timing = b.cueSettings ? `${b.startTime} --> ${b.endTime} ${b.cueSettings}` : b.rawTiming;
    parts.push(`${idLine}${timing}\n${outText(b)}`);
  }

  const body = parts.join("\n\n");
  return hasHeader ? body + "\n" : `WEBVTT\n\n${body}\n`;
}

/** Bilingual .txt: original line(s) then translation, per block. */
export function exportBilingualTxt(blocks: SubtitleBlock[]): string {
  const parts: string[] = [];
  for (const b of blocks) {
    if (b.isMeta || b.originalText.trim() === "") continue;
    parts.push(
      `#${b.index} [${b.startTime} --> ${b.endTime}]\n` +
        `ORIGINAL: ${b.originalText.replace(/\n/g, " ")}\n` +
        `TRADUCCIÓN: ${outText(b).replace(/\n/g, " ")}`
    );
  }
  return parts.join("\n\n") + "\n";
}

function csvCell(value: string): string {
  const needsQuote = /[",\n\r]/.test(value);
  const escaped = value.replace(/"/g, '""');
  return needsQuote ? `"${escaped}"` : escaped;
}

/** CSV with columns: index, startTime, endTime, originalText, translatedText. */
export function exportCsv(blocks: SubtitleBlock[]): string {
  const rows = ["index,startTime,endTime,originalText,translatedText"];
  for (const b of blocks) {
    if (b.isMeta || b.originalText.trim() === "") continue;
    rows.push(
      [
        String(b.index),
        csvCell(b.startTime),
        csvCell(b.endTime),
        csvCell(b.originalText),
        csvCell(b.translatedText),
      ].join(",")
    );
  }
  // Prepend BOM so Excel opens UTF-8 correctly.
  return "﻿" + rows.join("\n") + "\n";
}
