/**
 * Curated, real model + language catalogs for the assistant editor.
 *
 * These are the values the backend actually accepts:
 *   - LLM providers map 1:1 to caller/llm.py builders (openai | groq | ollama).
 *   - Model ids are passed straight through to each provider's API, so they
 *     must be valid model identifiers for that provider.
 *   - STT language is a BCP-47 tag forwarded to the STT engine.
 *
 * Strict dropdowns: the editor only offers these values (no free text), so a
 * misconfigured assistant can't be saved. Extend a list here to expose more.
 */

import type { CatalogModel, LlmProviderInfo } from "./api/catalog";

export type LlmProvider = "openai" | "groq" | "ollama";

export interface ModelOption {
  /** The id sent to the provider API (caller/llm.py). */
  value: string;
  /** Human label shown in the dropdown. */
  label: string;
  /** Short hint shown under the label. */
  hint?: string;
}

/** Real models per provider. Ollama entries must be pulled on the Ollama host. */
export const MODELS_BY_PROVIDER: Record<LlmProvider, ModelOption[]> = {
  openai: [
    { value: "gpt-4.1-mini", label: "GPT-4.1 mini", hint: "Fast · low cost · default" },
    { value: "gpt-4.1", label: "GPT-4.1", hint: "Highest quality" },
    { value: "gpt-4.1-nano", label: "GPT-4.1 nano", hint: "Cheapest · fastest" },
    { value: "gpt-4o", label: "GPT-4o", hint: "Omni · strong reasoning" },
    { value: "gpt-4o-mini", label: "GPT-4o mini", hint: "Balanced" },
  ],
  groq: [
    { value: "llama-3.3-70b-versatile", label: "Llama 3.3 70B", hint: "Versatile · best quality" },
    { value: "llama-3.1-8b-instant", label: "Llama 3.1 8B", hint: "Instant · lowest latency" },
    { value: "gemma2-9b-it", label: "Gemma 2 9B", hint: "Compact · instruction-tuned" },
  ],
  ollama: [
    { value: "qwen2.5", label: "Qwen 2.5", hint: "Local · Alibaba · general" },
    { value: "llama3.1", label: "Llama 3.1", hint: "Local · Meta · general" },
  ],
};

/** Pretty labels for the provider <Select>. */
export const PROVIDER_LABELS: Record<LlmProvider, string> = {
  openai: "OpenAI",
  groq: "Groq",
  ollama: "Ollama",
};

export function modelsForProvider(provider: string): ModelOption[] {
  return MODELS_BY_PROVIDER[provider as LlmProvider] ?? [];
}

export function isModelValid(provider: string, model: string): boolean {
  return modelsForProvider(provider).some((m) => m.value === model);
}

// --- Catalog-driven helpers (backend GET /api/catalog is source of truth) ----

/** Convert a backend CatalogModel into the editor's ModelOption shape. */
export function toModelOption(m: CatalogModel): ModelOption {
  return { value: m.id, label: m.label, hint: m.hint };
}

/**
 * Resolve the model list for a provider, preferring (1) a live-fetched list,
 * then (2) the backend catalog, then (3) the static seed as offline fallback.
 */
export function modelsFromCatalog(
  providers: LlmProviderInfo[] | undefined,
  provider: string,
  liveModels?: CatalogModel[]
): ModelOption[] {
  if (liveModels && liveModels.length) return liveModels.map(toModelOption);
  const fromCatalog = providers?.find((p) => p.id === provider)?.models;
  if (fromCatalog && fromCatalog.length) return fromCatalog.map(toModelOption);
  return modelsForProvider(provider);
}

const LANG_LABELS: Record<string, string> = {
  auto: "Auto-detect",
  en: "English (en)",
  ur: "Urdu (ur)",
  es: "Spanish (es)",
  fr: "French (fr)",
  de: "German (de)",
  hi: "Hindi (hi)",
  ar: "Arabic (ar)",
  pt: "Portuguese (pt)",
  zh: "Chinese (zh)",
  ja: "Japanese (ja)",
};

/** Friendly label for a BCP-47 code (or "auto"); falls back to the raw code. */
export function languageLabel(code: string): string {
  return LANG_LABELS[code] ?? code;
}

export interface LanguageOption {
  value: string;
  label: string;
}

/** BCP-47 language tags offered for STT. */
export const STT_LANGUAGES: LanguageOption[] = [
  { value: "en", label: "English (en)" },
  { value: "ur", label: "Urdu (ur)" },
  { value: "es", label: "Spanish (es)" },
  { value: "fr", label: "French (fr)" },
  { value: "de", label: "German (de)" },
  { value: "hi", label: "Hindi (hi)" },
  { value: "ar", label: "Arabic (ar)" },
  { value: "pt", label: "Portuguese (pt)" },
  { value: "zh", label: "Chinese (zh)" },
  { value: "ja", label: "Japanese (ja)" },
];
