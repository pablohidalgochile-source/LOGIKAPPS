import type { GlossaryEntry, TranslateRequest } from "@/types";
import { buildSystemPrompt, buildUserPrompt } from "./prompts";
import { applyGlossaryReplacements } from "./glossaryApply";

/** Server-only translation provider implementations. */

export class TranslationError extends Error {
  status: number;
  constructor(message: string, status = 502) {
    super(message);
    this.name = "TranslationError";
    this.status = status;
  }
}

/**
 * Mock provider — no network. Produces a deterministic "[TARGET] text"
 * so the whole flow (batching, editor, export) can be tested offline.
 */
export function mockTranslate(texts: string[], targetLang: string): string[] {
  return texts.map((t) => {
    if (t.trim() === "") return t;
    // Preserve leading formatting tags so QA checks behave realistically.
    return `[${targetLang}] ${t}`;
  });
}

/** Extract a JSON string array from a possibly noisy LLM response. */
function parseJsonArray(raw: string, expected: number): string[] {
  let text = raw.trim();
  // Strip markdown code fences if present.
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) text = fence[1].trim();
  // Grab the outermost array.
  const start = text.indexOf("[");
  const end = text.lastIndexOf("]");
  if (start !== -1 && end !== -1 && end > start) {
    text = text.slice(start, end + 1);
  }
  let arr: unknown;
  try {
    arr = JSON.parse(text);
  } catch {
    throw new TranslationError("La respuesta del modelo no es un arreglo JSON válido.");
  }
  if (!Array.isArray(arr)) {
    throw new TranslationError("La respuesta del modelo no es un arreglo.");
  }
  const strings = arr.map((x) => (typeof x === "string" ? x : String(x ?? "")));
  if (strings.length !== expected) {
    throw new TranslationError(
      `El modelo devolvió ${strings.length} líneas pero se esperaban ${expected}.`
    );
  }
  return strings;
}

export async function openaiTranslate(req: TranslateRequest): Promise<string[]> {
  const key = req.apiKey || process.env.OPENAI_API_KEY;
  if (!key) throw new TranslationError("Falta la clave de OpenAI (OPENAI_API_KEY).", 400);
  const model = req.model || "gpt-4o-mini";

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model,
      temperature: 0.2,
      messages: [
        {
          role: "system",
          content: buildSystemPrompt({
            targetLang: req.targetLang,
            styleInstruction: req.styleInstruction,
            glossary: req.glossary,
          }),
        },
        { role: "user", content: buildUserPrompt(req.texts) },
      ],
    }),
  });

  if (!res.ok) {
    const detail = await safeErr(res);
    throw new TranslationError(`OpenAI respondió ${res.status}: ${detail}`, res.status);
  }
  const data = await res.json();
  const content: string = data?.choices?.[0]?.message?.content ?? "";
  return postProcess(parseJsonArray(content, req.texts.length), req.glossary);
}

export async function anthropicTranslate(req: TranslateRequest): Promise<string[]> {
  const key = req.apiKey || process.env.ANTHROPIC_API_KEY;
  if (!key) throw new TranslationError("Falta la clave de Anthropic (ANTHROPIC_API_KEY).", 400);
  const model = req.model || "claude-sonnet-5";

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": key,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model,
      max_tokens: 4096,
      temperature: 0.2,
      system: buildSystemPrompt({
        targetLang: req.targetLang,
        styleInstruction: req.styleInstruction,
        glossary: req.glossary,
      }),
      messages: [{ role: "user", content: buildUserPrompt(req.texts) }],
    }),
  });

  if (!res.ok) {
    const detail = await safeErr(res);
    throw new TranslationError(`Anthropic respondió ${res.status}: ${detail}`, res.status);
  }
  const data = await res.json();
  const content: string = data?.content?.[0]?.text ?? "";
  return postProcess(parseJsonArray(content, req.texts.length), req.glossary);
}

export async function deeplTranslate(req: TranslateRequest): Promise<string[]> {
  const key = req.apiKey || process.env.DEEPL_API_KEY;
  if (!key) throw new TranslationError("Falta la clave de DeepL (DEEPL_API_KEY).", 400);
  // Free keys use api-free; paid use api. Free keys end in ":fx".
  const host = key.endsWith(":fx") ? "https://api-free.deepl.com" : "https://api.deepl.com";

  const params = new URLSearchParams();
  req.texts.forEach((t) => params.append("text", t));
  params.append("target_lang", toDeeplLang(req.targetLang));
  if (req.sourceLang && req.sourceLang !== "auto") {
    params.append("source_lang", toDeeplLang(req.sourceLang));
  }
  params.append("tag_handling", "xml");

  const res = await fetch(`${host}/v2/translate`, {
    method: "POST",
    headers: {
      Authorization: `DeepL-Auth-Key ${key}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: params.toString(),
  });

  if (!res.ok) {
    const detail = await safeErr(res);
    throw new TranslationError(`DeepL respondió ${res.status}: ${detail}`, res.status);
  }
  const data = await res.json();
  const translations: string[] = (data?.translations ?? []).map((t: { text: string }) => t.text);
  if (translations.length !== req.texts.length) {
    throw new TranslationError("DeepL devolvió una cantidad de líneas inesperada.");
  }
  return postProcess(translations, req.glossary);
}

export async function googleTranslate(req: TranslateRequest): Promise<string[]> {
  const key = req.apiKey || process.env.GOOGLE_TRANSLATE_API_KEY;
  if (!key) throw new TranslationError("Falta la clave de Google Translate.", 400);

  const res = await fetch(
    `https://translation.googleapis.com/language/translate/v2?key=${encodeURIComponent(key)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        q: req.texts,
        target: req.targetLang === "auto" ? "es" : req.targetLang,
        ...(req.sourceLang && req.sourceLang !== "auto" ? { source: req.sourceLang } : {}),
        format: "text",
      }),
    }
  );

  if (!res.ok) {
    const detail = await safeErr(res);
    throw new TranslationError(`Google respondió ${res.status}: ${detail}`, res.status);
  }
  const data = await res.json();
  const translations: string[] = (data?.data?.translations ?? []).map(
    (t: { translatedText: string }) => decodeHtmlEntities(t.translatedText)
  );
  if (translations.length !== req.texts.length) {
    throw new TranslationError("Google devolvió una cantidad de líneas inesperada.");
  }
  return postProcess(translations, req.glossary);
}

/** Apply deterministic glossary replacements on top of the raw output. */
function postProcess(translations: string[], glossary: GlossaryEntry[]): string[] {
  return translations.map((t) => applyGlossaryReplacements(t, glossary));
}

async function safeErr(res: Response): Promise<string> {
  try {
    const body = await res.text();
    return body.slice(0, 300);
  } catch {
    return res.statusText;
  }
}

function toDeeplLang(code: string): string {
  const c = code.toLowerCase();
  if (c === "pt") return "PT-BR";
  if (c === "en") return "EN-US";
  return c.toUpperCase();
}

function decodeHtmlEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(parseInt(n, 10)));
}
