/**
 * Seed voice catalog — used as fallback defaults.
 * At runtime, Voices.catalog() from GET /api/voices replaces this data
 * so voice lists stay current with the backend.
 */
import type { TtsEngineInfo } from "./api/catalog";

export type TtsEngine = "kokoro" | "piper_urdu" | "vibevoice" | "deepgram";

const SEED_CATALOG: Record<TtsEngine, string[]> = {
  kokoro: ["af_heart", "af_bella", "am_michael"],
  piper_urdu: ["fasih"],
  // VibeVoice 0.5B streaming — female preset voices (see caller/routes_catalog.py).
  vibevoice: ["Emma", "Grace"],
  // Deepgram Aura-2 streaming voices (mirrors caller/routes_twilio.py:_VOICES_CATALOG).
  deepgram: [
    "aura-2-thalia-en",
    "aura-2-andromeda-en",
    "aura-2-helena-en",
    "aura-2-apollo-en",
    "aura-2-arcas-en",
    "aura-2-aurora-en",
  ],
};

/**
 * Returns voices for a given TTS engine.
 * The runtimeCatalog param allows the editor to inject the live Voices.catalog()
 * result; falls back to SEED_CATALOG if not provided.
 */
export function voicesForEngine(
  engine: TtsEngine,
  runtimeCatalog?: Record<string, string[]>
): string[] {
  if (runtimeCatalog && runtimeCatalog[engine]) {
    return runtimeCatalog[engine];
  }
  return SEED_CATALOG[engine] ?? [];
}

/**
 * Returns true only when voice is a valid choice for the given engine.
 * Used to show an explanatory error message instead of silently allowing
 * an invalid engine/voice combination.
 */
export function isVoiceValid(
  engine: TtsEngine,
  voice: string,
  runtimeCatalog?: Record<string, string[]>
): boolean {
  return voicesForEngine(engine, runtimeCatalog).includes(voice);
}

/**
 * Resolve voices for an engine, preferring the backend catalog (complete lists),
 * then the runtime /api/voices catalog, then the static seed.
 */
export function voicesFromCatalog(
  ttsEngines: TtsEngineInfo[] | undefined,
  engine: string,
  runtimeCatalog?: Record<string, string[]>
): string[] {
  const fromCatalog = ttsEngines?.find((e) => e.id === engine)?.voices;
  if (fromCatalog && fromCatalog.length) return fromCatalog;
  return voicesForEngine(engine as TtsEngine, runtimeCatalog);
}
