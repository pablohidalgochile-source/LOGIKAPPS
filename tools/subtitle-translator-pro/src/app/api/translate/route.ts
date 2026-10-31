import { NextRequest, NextResponse } from "next/server";
import { translateBatch } from "@/lib/translation/translationService";
import { TranslationError } from "@/lib/translation/providers";
import type { TranslateRequest } from "@/types";

export const runtime = "nodejs";
// Never cache translation responses.
export const dynamic = "force-dynamic";

const MAX_BATCH = 60;

export async function POST(request: NextRequest) {
  let body: Partial<TranslateRequest>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido en la petición." }, { status: 400 });
  }

  const texts = body.texts;
  if (!Array.isArray(texts) || texts.some((t) => typeof t !== "string")) {
    return NextResponse.json({ error: "`texts` debe ser un arreglo de strings." }, { status: 400 });
  }
  if (texts.length === 0) {
    return NextResponse.json({ translations: [], provider: body.provider ?? "mock" });
  }
  if (texts.length > MAX_BATCH) {
    return NextResponse.json(
      { error: `Lote demasiado grande (${texts.length}). Máximo ${MAX_BATCH}.` },
      { status: 400 }
    );
  }

  const req: TranslateRequest = {
    texts,
    sourceLang: body.sourceLang || "auto",
    targetLang: body.targetLang || "es",
    styleInstruction: body.styleInstruction || "",
    provider: body.provider || "mock",
    apiKey: body.apiKey || undefined,
    model: body.model || undefined,
    glossary: Array.isArray(body.glossary) ? body.glossary : [],
  };

  try {
    const translations = await translateBatch(req);
    return NextResponse.json({ translations, provider: req.provider });
  } catch (err) {
    if (err instanceof TranslationError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    const message = err instanceof Error ? err.message : "Error de traducción desconocido.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
