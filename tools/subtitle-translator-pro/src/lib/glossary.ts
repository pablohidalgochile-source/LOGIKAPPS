import type { GlossaryEntry } from "@/types";

/**
 * Parse a raw glossary textarea into entries.
 * Accepted per-line forms:
 *   Frate                -> keep "Frate" untouched
 *   Campus Central       -> keep untouched
 *   DJ = disc jockey     -> force replacement
 *   DJ : disc jockey     -> force replacement
 */
export function parseGlossary(raw: string): GlossaryEntry[] {
  const entries: GlossaryEntry[] = [];
  const seen = new Set<string>();

  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const sepMatch = trimmed.match(/^(.+?)\s*[=:]\s*(.+)$/);
    let term: string;
    let replacement: string | undefined;
    if (sepMatch) {
      term = sepMatch[1].trim();
      replacement = sepMatch[2].trim();
    } else {
      term = trimmed;
    }

    const key = term.toLowerCase();
    if (!term || seen.has(key)) continue;
    seen.add(key);
    entries.push({ term, ...(replacement ? { replacement } : {}) });
  }

  return entries;
}

export function glossaryToText(entries: GlossaryEntry[]): string {
  return entries
    .map((e) => (e.replacement ? `${e.term} = ${e.replacement}` : e.term))
    .join("\n");
}

/** Build the instruction fragment describing glossary rules for the model. */
export function glossaryInstruction(entries: GlossaryEntry[]): string {
  if (entries.length === 0) return "";
  const rules = entries
    .map((e) =>
      e.replacement
        ? `- "${e.term}" debe traducirse siempre como "${e.replacement}".`
        : `- "${e.term}" NO se traduce; mantenlo idéntico.`
    )
    .join("\n");
  return `Respeta estrictamente el siguiente glosario:\n${rules}`;
}
