import type { GlossaryEntry } from "@/types";
import { glossaryInstruction } from "@/lib/glossary";

/**
 * System prompt used by LLM providers (OpenAI / Anthropic).
 *
 * The model receives a numbered list of subtitle lines and must return the
 * exact same count, in order, as a JSON array of strings — nothing else.
 */
export function buildSystemPrompt(params: {
  targetLang: string;
  styleInstruction: string;
  glossary: GlossaryEntry[];
}): string {
  const glossary = glossaryInstruction(params.glossary);
  return [
    "Eres un traductor profesional de subtítulos.",
    `Traduce al idioma solicitado (${params.targetLang}) manteniendo naturalidad, brevedad y sincronización.`,
    "No agregues explicaciones. No cambies el sentido. No traduzcas timestamps, numeración ni etiquetas técnicas.",
    "Conserva nombres propios, marcas y términos especiales.",
    "Mantén las etiquetas de formato (por ejemplo <i>, <b>, {\\an8}) intactas y en la misma posición.",
    "Si un bloque tiene varias líneas, conserva la misma cantidad de líneas.",
    params.styleInstruction,
    glossary,
    "",
    "Recibirás un arreglo JSON de textos. Devuelve EXCLUSIVAMENTE un arreglo JSON de strings",
    "con la misma cantidad de elementos y en el mismo orden, sin texto adicional.",
  ]
    .filter(Boolean)
    .join("\n");
}

/** User message: the batch of lines to translate, as a JSON array. */
export function buildUserPrompt(texts: string[]): string {
  return JSON.stringify(texts);
}
