import type { ParsedSubtitles, SubtitleFormat } from "@/types";
import { parseSrt } from "./srtParser";
import { parseVtt } from "./vttParser";

export function detectFormatFromName(fileName: string): SubtitleFormat | null {
  const ext = fileName.toLowerCase().split(".").pop();
  if (ext === "srt") return "srt";
  if (ext === "vtt") return "vtt";
  if (ext === "ass" || ext === "ssa") return "ass";
  return null;
}

/**
 * Parse subtitle content by explicit format, or auto-detected from the
 * file name. `.ass` is accepted but not yet fully supported.
 */
export function parseSubtitles(content: string, format: SubtitleFormat): ParsedSubtitles {
  switch (format) {
    case "srt":
      return parseSrt(content);
    case "vtt":
      return parseVtt(content);
    case "ass":
      return {
        format: "ass",
        blocks: [],
        translatableCount: 0,
        warnings: [
          "El formato .ass aún no está soportado en esta versión. Convierte a .srt o .vtt.",
        ],
      };
    default:
      return { format, blocks: [], translatableCount: 0, warnings: ["Formato desconocido."] };
  }
}
