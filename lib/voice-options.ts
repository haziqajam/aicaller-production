/**
 * Seed voice catalog — used as fallback defaults.
 * At runtime, Voices.catalog() from GET /api/voices replaces this data
 * so voice lists stay current with the backend.
 *
 * NOTE: this file covers engines with a FIXED voice list only. NeuTTS voices are
 * rows in the backend's `voices` collection (baked-in builtins + the owner's own
 * clones), so they are fetched per-render from GET /voices — see
 * `voiceOptionsFromVoices` below and the editor's Voices query.
 */
import type { TtsEngineInfo } from "./api/catalog";
import type { Voice } from "./api/resources";

export type TtsEngine =
  | "kokoro"
  | "piper_urdu"
  | "vibevoice"
  | "deepgram"
  | "neutts";

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
  // Intentionally empty: there is no meaningful static seed for NeuTTS. A
  // hardcoded fallback would name voices that may not exist for this tenant.
  neutts: [],
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

/** One entry in the Voice select. */
export type VoiceOption = {
  /** The value persisted to `tts.voice` — the backend voice `name`. */
  value: string;
  /** What the user reads. */
  label: string;
  /** Selectable? Encoding and failed clones are shown but not choosable. */
  disabled: boolean;
};

/**
 * True when this engine's voices come from GET /voices rather than a fixed list.
 * Driven by the backend's `dynamicVoices` flag, with an id fallback so a backend
 * that predates the flag still routes neutts correctly.
 */
export function hasDynamicVoices(
  ttsEngines: TtsEngineInfo[] | undefined,
  engine: string
): boolean {
  const info = ttsEngines?.find((e) => e.id === engine);
  if (info?.dynamicVoices) return true;
  return engine === "neutts";
}

/**
 * Turn GET /voices rows into select options.
 *
 * Voices still encoding, or that failed, are listed as DISABLED rather than
 * hidden — a clone that vanishes for the ~20s it takes to encode looks like the
 * upload was lost. Their state is spelled out in the label instead.
 */
export function voiceOptionsFromVoices(
  voices: Voice[] | undefined
): VoiceOption[] {
  return (voices ?? []).map((v) => ({
    value: v.name,
    label:
      v.status === "ready"
        ? v.displayName
        : v.status === "encoding"
          ? `${v.displayName} (processing…)`
          : `${v.displayName} (failed)`,
    disabled: v.status !== "ready",
  }));
}

/**
 * Options for ANY engine: dynamic ones come from the /voices rows, fixed ones
 * from the catalog/seed lists. One call site in the editor, so the Voice select
 * never has to branch on which kind of engine is selected.
 */
export function voiceOptionsForEngine(
  ttsEngines: TtsEngineInfo[] | undefined,
  engine: string,
  opts: { voices?: Voice[]; runtimeCatalog?: Record<string, string[]> } = {}
): VoiceOption[] {
  if (hasDynamicVoices(ttsEngines, engine)) {
    return voiceOptionsFromVoices(opts.voices);
  }
  return voicesFromCatalog(ttsEngines, engine, opts.runtimeCatalog).map((v) => ({
    value: v,
    label: v,
    disabled: false,
  }));
}

// ---------------------------------------------------------------------------
// Voice cloning — client-side mirrors of the server's rules.
// ---------------------------------------------------------------------------
// These exist to give immediate feedback in the upload form. The SERVER is
// still the authority (caller/voice_refs.py + the encoder re-validate
// everything); a mismatch here can only ever be an unhelpful UI, never a
// security or correctness hole.

/** Mirrors caller/voice_refs.VOICE_NAME_RE. */
export const VOICE_NAME_RE = /^[a-z0-9_]{1,40}$/;

/** Mirrors caller/voice_refs.slugify_name, so the previewed name is the real one. */
export function slugifyVoiceName(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40);
}

/** Conversational English is ~130-180 wpm; this mirrors the encoder's gate. */
export function transcriptCoverageWarning(
  transcript: string,
  durationSeconds: number | null
): string | null {
  if (!durationSeconds || durationSeconds <= 0) return null;
  const words = transcript.trim().split(/\s+/).filter(Boolean).length;
  if (!words) return null;
  const wpm = (words / durationSeconds) * 60;
  if (wpm < 45)
    return `${words} words for ${durationSeconds.toFixed(1)}s of audio is far too slow to be real speech — the transcript probably doesn't cover the whole clip.`;
  if (wpm > 260)
    return `${words} words for ${durationSeconds.toFixed(1)}s of audio is too fast — the transcript likely describes more than this clip contains.`;
  return null;
}


/** Clip bounds — mirror the backend's VOICE_CLONE_MIN/MAX_SECONDS defaults. */
export const CLONE_MIN_SECONDS = 3;
export const CLONE_MAX_SECONDS = 20;
