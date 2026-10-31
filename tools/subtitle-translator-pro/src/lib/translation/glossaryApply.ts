import type { GlossaryEntry } from "@/types";

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Deterministically enforce glossary entries that specify a forced
 * replacement, applied after the provider returns. Entries without a
 * replacement are handled by the prompt (kept untouched) and need no
 * post-processing here.
 */
export function applyGlossaryReplacements(text: string, glossary: GlossaryEntry[]): string {
  let out = text;
  for (const entry of glossary) {
    if (!entry.replacement) continue;
    // Word-ish boundaries that also work for multi-word terms.
    const re = new RegExp(`(?<![\\p{L}\\p{N}])${escapeRegExp(entry.term)}(?![\\p{L}\\p{N}])`, "giu");
    out = out.replace(re, entry.replacement);
  }
  return out;
}
