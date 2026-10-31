import type { TranslationStyle } from "@/types";

/** Target-language / register presets available in the config screen. */
export const TRANSLATION_STYLES: TranslationStyle[] = [
  {
    id: "es-latam",
    label: "Español latino neutro",
    instruction:
      "Traduce a español latinoamericano neutro, natural y claro, evitando modismos regionales.",
  },
  {
    id: "es-cl",
    label: "Español chileno natural",
    instruction:
      "Traduce a español chileno natural y coloquial cuando el tono lo permita, manteniendo claridad.",
  },
  {
    id: "es-es",
    label: "Español de España",
    instruction: "Traduce a español de España (castellano), con expresiones peninsulares naturales.",
  },
  {
    id: "en",
    label: "Inglés",
    instruction: "Translate into natural, fluent English.",
  },
  {
    id: "pt",
    label: "Portugués",
    instruction: "Traduz para português natural e fluente.",
  },
  {
    id: "fr",
    label: "Francés",
    instruction: "Traduis en français naturel et fluide.",
  },
  {
    id: "it",
    label: "Italiano",
    instruction: "Traduci in italiano naturale e scorrevole.",
  },
  {
    id: "de",
    label: "Alemán",
    instruction: "Übersetze in natürliches, flüssiges Deutsch.",
  },
];

export function getStyle(id: string): TranslationStyle {
  return TRANSLATION_STYLES.find((s) => s.id === id) ?? TRANSLATION_STYLES[0];
}

/** Common language options for source/target dropdowns. */
export const LANGUAGES: { code: string; label: string }[] = [
  { code: "auto", label: "Detección automática" },
  { code: "es", label: "Español" },
  { code: "en", label: "Inglés" },
  { code: "pt", label: "Portugués" },
  { code: "fr", label: "Francés" },
  { code: "it", label: "Italiano" },
  { code: "de", label: "Alemán" },
  { code: "ja", label: "Japonés" },
  { code: "ko", label: "Coreano" },
  { code: "zh", label: "Chino" },
];
