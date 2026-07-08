/**
 * Catalog client — the backend (GET /api/catalog) is the single source of truth
 * for selectable LLM providers / STT engines / TTS engines and their model,
 * voice, and language lists. GET /api/models/{provider} live-fetches Groq/Ollama
 * models to overlay on top of the catalog seed.
 *
 * See docs/superpowers/specs/2026-06-11-assistant-feature-completion-design.md.
 */
import { apiFetch } from "./client";

export type ServiceType = "cloud" | "self-hosted";

export interface CatalogModel {
  id: string;
  label: string;
  hint?: string;
}

export interface LlmProviderInfo {
  id: string;
  label: string;
  type: ServiceType;
  /** When true, the editor overlays a live GET /api/models/{id} fetch. */
  live: boolean;
  models: CatalogModel[];
}

export interface SttEngineInfo {
  id: string;
  label: string;
  type: ServiceType;
  languages: string[];
  /** Present for whisper_local: selectable faster-whisper model sizes. */
  modelSizes?: string[];
}

export interface TtsEngineInfo {
  id: string;
  label: string;
  type: ServiceType;
  voices: string[];
}

export interface CatalogData {
  llm: LlmProviderInfo[];
  stt: SttEngineInfo[];
  tts: TtsEngineInfo[];
}

export const Catalog = {
  get: () => apiFetch<CatalogData>("/api/catalog"),
  providerModels: (provider: string) =>
    apiFetch<{ provider: string; models: CatalogModel[] }>(
      `/api/models/${provider}`
    ),
};
