"use client";

import { create } from "zustand";
import type {
  AppStep,
  ParsedSubtitles,
  SubtitleBlock,
  SubtitleFormat,
  TranslationConfig,
} from "@/types";

export interface FileMeta {
  name: string;
  size: number;
  format: SubtitleFormat;
  lineCount: number;
}

const DEFAULT_CONFIG: TranslationConfig = {
  sourceLang: "auto",
  targetLang: "es",
  styleId: "es-latam",
  provider: "mock",
  apiKey: "",
  model: "",
  glossary: [],
  batchSize: 20,
};

interface AppState {
  step: AppStep;
  fileMeta: FileMeta | null;
  parsed: ParsedSubtitles | null;
  config: TranslationConfig;
  translating: boolean;

  setStep: (step: AppStep) => void;
  loadParsed: (parsed: ParsedSubtitles, meta: FileMeta) => void;
  setConfig: (patch: Partial<TranslationConfig>) => void;
  setTranslating: (v: boolean) => void;

  /** Replace the translated text of a block by its array position. */
  updateBlockTranslation: (arrayIndex: number, text: string) => void;
  /** Bulk-apply a list of translations aligned to the translatable blocks. */
  applyTranslations: (translations: (string | null)[]) => void;
  reset: () => void;
}

/** Array positions of blocks that are actually translatable (text, not meta). */
export function translatableIndices(parsed: ParsedSubtitles | null): number[] {
  if (!parsed) return [];
  const out: number[] = [];
  parsed.blocks.forEach((b, i) => {
    if (!b.isMeta && b.originalText.trim() !== "") out.push(i);
  });
  return out;
}

export const useAppStore = create<AppState>((set) => ({
  step: "home",
  fileMeta: null,
  parsed: null,
  config: DEFAULT_CONFIG,
  translating: false,

  setStep: (step) => set({ step }),

  loadParsed: (parsed, meta) => set({ parsed, fileMeta: meta, step: "config" }),

  setConfig: (patch) => set((s) => ({ config: { ...s.config, ...patch } })),

  setTranslating: (v) => set({ translating: v }),

  updateBlockTranslation: (arrayIndex, text) =>
    set((s) => {
      if (!s.parsed) return s;
      const blocks = s.parsed.blocks.slice();
      const b = blocks[arrayIndex];
      if (!b) return s;
      blocks[arrayIndex] = { ...b, translatedText: text };
      return { parsed: { ...s.parsed, blocks } };
    }),

  applyTranslations: (translations) =>
    set((s) => {
      if (!s.parsed) return s;
      const indices = translatableIndices(s.parsed);
      const blocks: SubtitleBlock[] = s.parsed.blocks.slice();
      indices.forEach((blockIdx, i) => {
        const t = translations[i];
        if (t !== null && t !== undefined) {
          blocks[blockIdx] = { ...blocks[blockIdx], translatedText: t };
        }
      });
      return { parsed: { ...s.parsed, blocks } };
    }),

  reset: () =>
    set({ step: "home", fileMeta: null, parsed: null, translating: false, config: DEFAULT_CONFIG }),
}));
