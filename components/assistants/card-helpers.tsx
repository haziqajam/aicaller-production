"use client";

/**
 * Shared presentation helpers for the Assistants page redesign.
 *
 * Keeps the assistant-card lean and lets the filter toolbar reuse the exact
 * same label/icon vocabulary as the card (and, transitively, the editor).
 */

import {
  Sparkles,
  Zap,
  Server,
  Waves,
  FlaskConical,
  Languages,
  Volume2,
  Ear,
  BrainCircuit,
  AudioLines,
  type LucideIcon,
} from "lucide-react";
import { PROVIDER_LABELS, MODELS_BY_PROVIDER, type LlmProvider } from "@/lib/model-options";

/* ─────────────────────────────────────────────────────────────────────────
 * Icon maps — mirror components/assistant-editor/editor-form.tsx so an
 * assistant reads the same across the editor and the card.
 * ──────────────────────────────────────────────────────────────────────── */
export const PROVIDER_ICON: Record<string, LucideIcon> = {
  openai: Sparkles,
  groq: Zap,
  ollama: Server,
};

export const STT_ICON: Record<string, LucideIcon> = {
  deepgram: Waves,
  openai: Sparkles,
  asrtest: FlaskConical,
  whisper_local: Languages,
};

export const TTS_ICON: Record<string, LucideIcon> = {
  kokoro: Volume2,
  piper_urdu: Languages,
  vibevoice: Volume2,
  deepgram: Waves,
};

/** Stage glyphs for the STT → LLM → TTS chain. */
export const STAGE_ICON = { stt: Ear, llm: BrainCircuit, tts: AudioLines } as const;

/* End-user-facing engine labels (match the editor's capability-based naming). */
export const STT_LABEL: Record<string, string> = {
  deepgram: "Deepgram",
  openai: "OpenAI Whisper",
  asrtest: "Urdu (Local)",
  whisper_local: "Multilingual (Local)",
};

export const TTS_LABEL: Record<string, string> = {
  kokoro: "English (Local)",
  piper_urdu: "Urdu (Local)",
  vibevoice: "Natural HD (Local)",
  deepgram: "Deepgram Aura",
};

export function providerLabel(id?: string): string {
  if (!id) return "—";
  return PROVIDER_LABELS[id as LlmProvider] ?? id;
}

export function sttLabel(id?: string): string {
  if (!id) return "—";
  return STT_LABEL[id] ?? id;
}

export function ttsLabel(id?: string): string {
  if (!id) return "—";
  return TTS_LABEL[id] ?? id;
}

/** Human label for a model id within its provider (falls back to the raw id). */
export function modelLabel(provider: string | undefined, model: string | undefined): string {
  if (!model) return "—";
  const list = MODELS_BY_PROVIDER[provider as LlmProvider] ?? [];
  return list.find((m) => m.value === model)?.label ?? model;
}

/* ─────────────────────────────────────────────────────────────────────────
 * created_at → "Created 3 days ago" (graceful — returns null when absent).
 * ──────────────────────────────────────────────────────────────────────── */
const RTF = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
const DIVISIONS: { amount: number; unit: Intl.RelativeTimeFormatUnit }[] = [
  { amount: 60, unit: "second" },
  { amount: 60, unit: "minute" },
  { amount: 24, unit: "hour" },
  { amount: 7, unit: "day" },
  { amount: 4.34524, unit: "week" },
  { amount: 12, unit: "month" },
  { amount: Number.POSITIVE_INFINITY, unit: "year" },
];

export function relativeTime(iso?: string): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  let duration = (date.getTime() - Date.now()) / 1000;
  for (const division of DIVISIONS) {
    if (Math.abs(duration) < division.amount) {
      return RTF.format(Math.round(duration), division.unit);
    }
    duration /= division.amount;
  }
  return null;
}

/** Full, locale-formatted timestamp for the tooltip title. */
export function absoluteTime(iso?: string): string {
  if (!iso) return "Date unknown";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "Date unknown";
  return date.toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}
