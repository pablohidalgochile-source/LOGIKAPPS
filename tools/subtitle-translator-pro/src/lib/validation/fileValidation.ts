import { detectFormatFromName } from "@/lib/subtitles/subtitleParser";
import type { SubtitleFormat } from "@/types";

/** Maximum accepted file size. Keeps everything comfortable in memory. */
export const MAX_FILE_BYTES = 2 * 1024 * 1024; // 2 MB
export const ACCEPTED_EXTENSIONS = [".srt", ".vtt", ".ass"];

export interface FileValidationResult {
  ok: boolean;
  format?: SubtitleFormat;
  error?: string;
}

export function validateSubtitleFile(file: File): FileValidationResult {
  const format = detectFormatFromName(file.name);
  if (!format) {
    return {
      ok: false,
      error: `Extensión no permitida. Usa uno de: ${ACCEPTED_EXTENSIONS.join(", ")}.`,
    };
  }

  if (file.size === 0) {
    return { ok: false, error: "El archivo está vacío." };
  }

  if (file.size > MAX_FILE_BYTES) {
    return {
      ok: false,
      error: `El archivo es demasiado grande (${formatBytes(file.size)}). El máximo es ${formatBytes(
        MAX_FILE_BYTES
      )}.`,
    };
  }

  return { ok: true, format };
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}
