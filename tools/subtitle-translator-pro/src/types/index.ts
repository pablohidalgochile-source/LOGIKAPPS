// Core domain types for Subtitle Translator Pro

export type SubtitleFormat = "srt" | "vtt" | "ass";

/**
 * A single translatable subtitle block. Timing/numbering/metadata are kept
 * verbatim so exports can rebuild the file exactly as the original.
 */
export interface SubtitleBlock {
  /** 1-based sequence number as shown in the file (may differ from array index). */
  index: number;
  /** Display start time, e.g. "00:00:01,000". Empty for cue-less notes. */
  startTime: string;
  /** Display end time, e.g. "00:00:04,000". */
  endTime: string;
  /** Original spoken text (may contain internal line breaks). */
  originalText: string;
  /** User-editable translation. Empty until translated. */
  translatedText: string;
  /** The exact timing line as it appeared in the source file. */
  rawTiming: string;
  /** Format this block came from. */
  format: SubtitleFormat;
  /** Optional cue identifier / settings (VTT) preserved verbatim. */
  cueId?: string;
  cueSettings?: string;
  /**
   * Non-translatable structural entry (e.g. WEBVTT header, NOTE, STYLE, REGION).
   * These are carried through untouched and never sent to the translator.
   */
  isMeta?: boolean;
  /** Raw content for meta blocks, reproduced verbatim on export. */
  metaRaw?: string;
}

export interface ParsedSubtitles {
  format: SubtitleFormat;
  blocks: SubtitleBlock[];
  /** Blocks that actually contain translatable text. */
  translatableCount: number;
  /** Warnings surfaced during parsing (malformed timings, etc.). */
  warnings: string[];
}

export type TranslationProvider = "mock" | "openai" | "anthropic" | "deepl" | "google";

export interface GlossaryEntry {
  /** Term that must be preserved / not translated (or forced to a value). */
  term: string;
  /** Optional forced replacement. When empty, term is kept as-is. */
  replacement?: string;
}

export interface TranslationStyle {
  id: string;
  label: string;
  /** Instruction fragment injected into the system prompt. */
  instruction: string;
}

export interface TranslationConfig {
  sourceLang: string; // "auto" allowed
  targetLang: string;
  styleId: string;
  provider: TranslationProvider;
  /** Optional user-supplied key (BYOK). Never persisted. */
  apiKey?: string;
  /** Optional model override for LLM providers. */
  model?: string;
  glossary: GlossaryEntry[];
  batchSize: number;
}

export interface TranslateRequest {
  texts: string[];
  sourceLang: string;
  targetLang: string;
  styleInstruction: string;
  provider: TranslationProvider;
  apiKey?: string;
  model?: string;
  glossary: GlossaryEntry[];
}

export interface TranslateResponse {
  translations: string[];
  provider: TranslationProvider;
  warning?: string;
}

export type QualityIssueLevel = "error" | "warning" | "info";

export interface QualityIssue {
  level: QualityIssueLevel;
  code: string;
  message: string;
  /** Block index the issue refers to, when applicable. */
  blockIndex?: number;
}

export type ExportFormat = "srt" | "vtt" | "txt" | "csv";

export type AppStep = "home" | "config" | "translate" | "edit" | "export";
