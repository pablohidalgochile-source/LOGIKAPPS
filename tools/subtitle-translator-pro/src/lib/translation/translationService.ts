import type { TranslateRequest } from "@/types";
import {
  TranslationError,
  anthropicTranslate,
  deeplTranslate,
  googleTranslate,
  mockTranslate,
  openaiTranslate,
} from "./providers";

/** Retry a translation call with exponential backoff on transient failures. */
async function withRetry<T>(fn: () => Promise<T>, retries = 2): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      // Do not retry client errors (bad key, bad request).
      if (err instanceof TranslationError && err.status >= 400 && err.status < 500) throw err;
      if (attempt < retries) {
        await new Promise((r) => setTimeout(r, 400 * Math.pow(2, attempt)));
      }
    }
  }
  throw lastErr;
}

/**
 * Server-side entry point. Routes a batch to the chosen provider and returns
 * translations in the exact same order/length as the input.
 */
export async function translateBatch(req: TranslateRequest): Promise<string[]> {
  // Empty lines are never sent to a provider; they map to themselves.
  const nonEmptyIdx: number[] = [];
  const payload: string[] = [];
  req.texts.forEach((t, i) => {
    if (t.trim() !== "") {
      nonEmptyIdx.push(i);
      payload.push(t);
    }
  });

  if (payload.length === 0) return req.texts.map(() => "");

  const scoped: TranslateRequest = { ...req, texts: payload };

  let translated: string[];
  switch (req.provider) {
    case "mock":
      translated = mockTranslate(payload, req.targetLang);
      break;
    case "openai":
      translated = await withRetry(() => openaiTranslate(scoped));
      break;
    case "anthropic":
      translated = await withRetry(() => anthropicTranslate(scoped));
      break;
    case "deepl":
      translated = await withRetry(() => deeplTranslate(scoped));
      break;
    case "google":
      translated = await withRetry(() => googleTranslate(scoped));
      break;
    default:
      throw new TranslationError(`Proveedor desconocido: ${req.provider}`, 400);
  }

  // Re-expand to original positions, keeping empty lines empty.
  const result = req.texts.map(() => "");
  nonEmptyIdx.forEach((origIdx, i) => {
    result[origIdx] = translated[i] ?? "";
  });
  return result;
}
