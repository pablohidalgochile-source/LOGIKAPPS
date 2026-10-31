import type { GlossaryEntry, TranslationConfig, TranslationProvider } from "@/types";

/** Client → server call for a single batch. */
async function requestBatch(params: {
  texts: string[];
  config: TranslationConfig;
  styleInstruction: string;
  signal?: AbortSignal;
}): Promise<string[]> {
  const { texts, config, styleInstruction, signal } = params;
  const res = await fetch("/api/translate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    signal,
    body: JSON.stringify({
      texts,
      sourceLang: config.sourceLang,
      targetLang: config.targetLang,
      styleInstruction,
      provider: config.provider,
      apiKey: config.apiKey || undefined,
      model: config.model || undefined,
      glossary: config.glossary,
    }),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data?.error || `El servidor respondió ${res.status}.`);
  }
  if (!Array.isArray(data.translations) || data.translations.length !== texts.length) {
    throw new Error("La respuesta del servidor no coincide con el lote enviado.");
  }
  return data.translations;
}

export interface BatchProgress {
  done: number;
  total: number;
  batchIndex: number;
  batchCount: number;
}

export interface TranslateItemsResult {
  translations: (string | null)[];
  errors: { batchIndex: number; message: string }[];
}

/**
 * Translate an ordered list of texts by splitting into small batches.
 * Failed batches leave their slots as null (kept for retry) and are reported
 * without aborting the rest — order is always preserved.
 */
export async function translateItems(params: {
  texts: string[];
  config: TranslationConfig;
  styleInstruction: string;
  onProgress?: (p: BatchProgress) => void;
  signal?: AbortSignal;
}): Promise<TranslateItemsResult> {
  const { texts, config, styleInstruction, onProgress, signal } = params;
  const size = Math.max(1, Math.min(config.batchSize || 20, 60));
  const batches: { start: number; items: string[] }[] = [];
  for (let i = 0; i < texts.length; i += size) {
    batches.push({ start: i, items: texts.slice(i, i + size) });
  }

  const translations: (string | null)[] = new Array(texts.length).fill(null);
  const errors: { batchIndex: number; message: string }[] = [];
  let done = 0;

  for (let bi = 0; bi < batches.length; bi++) {
    if (signal?.aborted) throw new DOMException("Traducción cancelada.", "AbortError");
    const batch = batches[bi];
    try {
      const result = await requestBatch({ texts: batch.items, config, styleInstruction, signal });
      result.forEach((t, i) => {
        translations[batch.start + i] = t;
      });
    } catch (err) {
      // A cancellation must bubble up, not be recorded as a batch error.
      if (err instanceof DOMException && err.name === "AbortError") throw err;
      if (signal?.aborted) throw new DOMException("Traducción cancelada.", "AbortError");
      errors.push({
        batchIndex: bi,
        message: err instanceof Error ? err.message : "Error desconocido.",
      });
    }
    done += batch.items.length;
    onProgress?.({ done, total: texts.length, batchIndex: bi + 1, batchCount: batches.length });
  }

  // --- Repair pass -------------------------------------------------------
  // Some lines come back empty, null (failed batch) or echoed unchanged in the
  // source language. Retranslate those one by one — a single-line request has
  // no alignment ambiguity — so the export never silently falls back to the
  // original. Bounded rounds keep cost predictable.
  const anySuccess = translations.some((t) => t !== null);
  if (anySuccess) {
    // Safety caps so a systemic failure (bad key) or a source≈target file does
    // not fan out into hundreds of single-line calls.
    const MAX_REPAIRS = 120;
    const MAX_ECHO_CHASE = 40;
    let repairsSpent = 0;

    for (let round = 0; round < 2 && repairsSpent < MAX_REPAIRS; round++) {
      if (signal?.aborted) throw new DOMException("Traducción cancelada.", "AbortError");

      // Hard failures (null/empty) are always retried. Echoes are only chased
      // on the first round and only when there are few of them.
      const hard = collectMissing(texts, translations, false);
      const echoes =
        round === 0 ? collectMissing(texts, translations, true).filter((i) => !hard.includes(i)) : [];
      const targets = [...hard, ...(echoes.length <= MAX_ECHO_CHASE ? echoes : [])];
      if (targets.length === 0) break;

      for (const idx of targets) {
        if (repairsSpent >= MAX_REPAIRS) break;
        if (signal?.aborted) throw new DOMException("Traducción cancelada.", "AbortError");
        repairsSpent++;
        try {
          const [fixed] = await requestBatch({
            texts: [texts[idx]],
            config,
            styleInstruction,
            signal,
          });
          // Keep the repair only if it is a real improvement.
          if (fixed && fixed.trim() !== "") translations[idx] = fixed;
        } catch (err) {
          if (err instanceof DOMException && err.name === "AbortError") throw err;
          // Leave the slot as-is; it will surface in quality checks.
        }
      }
    }
  }

  // Report only the lines that are still missing after repair.
  const stillMissing = collectMissing(texts, translations, false).length;
  const finalErrors =
    stillMissing > 0
      ? [
          ...errors.slice(0, 3),
          { batchIndex: -1, message: `${stillMissing} línea(s) no se pudieron traducir tras reintentar.` },
        ]
      : [];

  return { translations, errors: finalErrors };
}

/** Strip formatting tags / whitespace so two strings can be compared as speech. */
function normalizeForCompare(s: string): string {
  return s
    .replace(/<[^>]+>/g, "")
    .replace(/\{[^}]*\}/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

/** A source line that clearly carries translatable words (not just symbols/numbers). */
function isTranslatable(src: string): boolean {
  const bare = normalizeForCompare(src);
  return bare.length >= 2 && /\p{L}/u.test(bare);
}

/**
 * Indices whose translation is missing (null/empty) or, when chaseEchoes is on,
 * identical to the source despite carrying real words.
 */
function collectMissing(
  texts: string[],
  translations: (string | null)[],
  chaseEchoes: boolean
): number[] {
  const out: number[] = [];
  for (let i = 0; i < texts.length; i++) {
    if (texts[i].trim() === "") continue; // nothing to translate
    const t = translations[i];
    if (t === null || t === undefined || t.trim() === "") {
      out.push(i);
      continue;
    }
    if (
      chaseEchoes &&
      isTranslatable(texts[i]) &&
      normalizeForCompare(t) === normalizeForCompare(texts[i])
    ) {
      out.push(i);
    }
  }
  return out;
}

export const PROVIDER_LABELS: Record<TranslationProvider, string> = {
  mock: "Simulado (sin conexión)",
  openai: "OpenAI",
  anthropic: "Anthropic",
  deepl: "DeepL",
  google: "Google Translate",
};

/** Whether a provider needs a key that could come from the browser (BYOK). */
export function providerNeedsKey(provider: TranslationProvider): boolean {
  return provider !== "mock";
}

export function glossaryPreview(glossary: GlossaryEntry[]): string {
  if (!glossary.length) return "Sin términos";
  return glossary
    .slice(0, 4)
    .map((g) => g.term)
    .join(", ") + (glossary.length > 4 ? "…" : "");
}
