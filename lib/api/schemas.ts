import { z } from "zod";

// Field length/range caps — mirror caller/models.py so the form rejects (with a
// friendly inline message + char counter) before the backend 422s. Exported so
// the editor can show "x / MAX" counters from a single source of truth.
export const LIMITS = {
  name: 120,
  systemPrompt: 10000,
  firstMessage: 2000,
  model: 120,
  language: 35,
  voice: 120,
  announcement: 2000,
  triggerPhrase: 2000,
  whisperTemplate: 2000,
  transferNumber: 20,
  voicemailMessage: 2000,
  navigationPrompt: 2000,
  goodbyeMessage: 1000,
  instructions: 2000,
  endCallPhrase: 200,
  endCallPhrases: 30,
  questionText: 1000,
  questionHint: 500,
  questions: 30,
  toolIds: 100,
} as const;

const E164_OR_EMPTY = (v: string) => v === "" || /^\+[1-9]\d{1,14}$/.test(v);

export const llmConfig = z.object({
  provider: z.enum(["openai", "groq", "ollama"]).default("openai"),
  model: z.string().max(LIMITS.model).default("gpt-4.1-mini"),
});
export const sttConfig = z.object({
  engine: z.enum(["deepgram", "openai", "asrtest", "whisper_local"]).default("deepgram"),
  language: z.string().max(LIMITS.language).default("en"),
  // Whisper-local model size (e.g. "small", "large-v3-turbo"); omitted for other engines.
  // nullish (not just optional): the Base UI Select holds `null` when unselected, and
  // for non-whisper engines this stays null — `.optional()` alone rejects null with
  // "expected string, received null". Backend STTConfig.model is Optional[str]=None.
  model: z.string().max(LIMITS.model).nullish(),
});
export const ttsConfig = z.object({
  engine: z.enum(["kokoro", "piper_urdu", "vibevoice", "deepgram"]).default("kokoro"),
  voice: z.string().max(LIMITS.voice).default("af_heart"),
  // Speaking-rate multiplier. 1.0 = engine default; honored by kokoro & piper_urdu,
  // ignored by deepgram. Matches backend TTSConfig.speed (ge 0.5, le 2.0).
  speed: z.number().min(0.5).max(2).default(1),
});
export const vadConfig = z.object({
  // End-of-speech responsiveness preset (maps to VADParams server-side).
  responsiveness: z.enum(["snappy", "balanced", "patient"]).default("balanced"),
});
export const idleConfig = z.object({
  timeout: z.number().min(1).max(120).default(5),
  maxRetries: z.number().int().min(0).max(10).default(2),
  holdMaxSec: z.number().min(1).max(600).default(30),
});
export const transferConfig = z.object({
  enabled: z.boolean().default(false),
  // Spoken to the CALLER right before the hand-off (e.g. "Please hold while I connect you.").
  announcement: z.string().max(LIMITS.announcement).default(""),
  // Natural-language description of when to transfer; injected as guidance so the
  // LLM calls transfer_call when the caller expresses this intent.
  triggerPhrase: z.string().max(LIMITS.triggerPhrase).default(""),
  // Exactly one target. Kept as a (max 1) array for backend/route compatibility —
  // the bot and /voice/transfer routes already read targets[0]. The number must be
  // E.164 (or empty = not set yet) — mirrors the backend validator.
  targets: z
    .array(z.object({
      number: z.string().max(LIMITS.transferNumber)
        .refine(E164_OR_EMPTY, "Use E.164 format, e.g. +14155551234"),
      whisperTemplate: z.string().max(LIMITS.whisperTemplate).default(""),
    }))
    .max(1)
    .default([]),
});
export const voicemailConfig = z.object({
  enabled: z.boolean().default(false),
  // Spoken into the voicemail before hanging up (overridable here in the UI).
  message: z
    .string()
    .max(LIMITS.voicemailMessage)
    .default(
      "Sorry we couldn't reach you. Please call us back at your convenience. Thank you.",
    ),
  // Seconds of silence after the greeting before leaving the message.
  responseDelay: z.number().min(0).max(30).default(2),
});
export const ivrConfig = z.object({
  enabled: z.boolean().default(false),
  // Free-text guidance: how/when the bot should press keys to navigate menus.
  navigationPrompt: z.string().max(LIMITS.navigationPrompt).default(""),
});
export const endCallConfig = z.object({
  enabled: z.boolean().default(false),
  // Optional closing line spoken before the call ends.
  goodbyeMessage: z.string().max(LIMITS.goodbyeMessage).default(""),
  // Natural-language description of WHEN the bot should end the call.
  instructions: z.string().max(LIMITS.instructions).default(""),
  // Phrases that should prompt the bot to end the call when the caller says them.
  endCallPhrases: z.array(z.string().max(LIMITS.endCallPhrase)).max(LIMITS.endCallPhrases).default([]),
});
// Custom HTTP tools (controls/01) — reusable, owner-scoped; attached via toolIds.
export const toolParam = z.object({
  name: z.string().min(1),
  type: z.enum(["string", "number", "boolean"]).default("string"),
  description: z.string().default(""),
  required: z.boolean().default(false),
  location: z.enum(["query", "body", "path"]).default("query"),
});
export const toolSchema = z.object({
  id: z.string().optional(),
  name: z.string().regex(/^[a-zA-Z_][a-zA-Z0-9_]{0,63}$/, "Use a valid function name (no spaces)"),
  description: z.string().default(""),
  method: z.enum(["GET", "POST"]).default("GET"),
  url: z.string().url(),
  headers: z.record(z.string(), z.string()).default({}),
  parameters: z.array(toolParam).default([]),
  timeoutSeconds: z.number().int().min(1).max(60).default(10),
  created_at: z.string().optional(),
});
export type Tool = z.infer<typeof toolSchema>;

// Leads + Lead Lists (batch-2/06).
export const leadSchema = z.object({
  id: z.string().optional(),
  name: z.string().optional(),
  phone: z.string().optional(),
  status: z.string().optional(),
  source: z.string().optional(),
  created_at: z.string().optional(),
  vars: z.record(z.string(), z.unknown()).optional(),
});
export type Lead = z.infer<typeof leadSchema>;

export const leadListSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1, "Name is required"),
  description: z.string().default(""),
  leadIds: z.array(z.string()).default([]),
  leadCount: z.number().int().default(0),
  created_at: z.string().optional(),
});
export type LeadList = z.infer<typeof leadListSchema>;

// Number lists (mirror lead lists) — a reusable, owner-scoped group of the
// caller's provisioned Twilio numbers. A campaign dials FROM this pool.
export const numberListSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1, "Name is required"),
  description: z.string().default(""),
  numberIds: z.array(z.string()).default([]),
  numberCount: z.number().int().default(0),
  created_at: z.string().optional(),
});
export type NumberList = z.infer<typeof numberListSchema>;
// A member number of a list, resolved to its phone string.
export const numberListMemberSchema = z.object({
  id: z.string(),
  phoneNumber: z.string().nullish(),
  assistantId: z.string().nullish(),
});
export type NumberListMember = z.infer<typeof numberListMemberSchema>;

// End-of-call analysis question. Lives on the ASSISTANT (covers inbound+outbound).
// Output shape the LLM must return (default boolean → back-compat). `id` is
// server-assigned on assistant save.
export const questionTypeSchema = z.enum(["boolean", "descriptive", "json"]);
export type QuestionType = z.infer<typeof questionTypeSchema>;
export const analysisQuestionSchema = z.object({
  id: z.string().optional(),
  text: z.string().max(LIMITS.questionText),
  type: questionTypeSchema.default("boolean"),
  hint: z.string().max(LIMITS.questionHint).optional(),
});
export type AnalysisQuestion = z.infer<typeof analysisQuestionSchema>;

export const assistantSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1, "Name is required").max(LIMITS.name),
  systemPrompt: z.string().min(1, "Prompt is required").max(LIMITS.systemPrompt),
  firstMessage: z.string().max(LIMITS.firstMessage).default(""),
  // When true the assistant speaks first (firstMessage); when false the caller speaks first.
  firstMessageEnabled: z.boolean().default(true),
  // When true the caller can interrupt the bot mid-speech (barge-in); when false the bot speaks uninterrupted.
  allowInterruptions: z.boolean().default(true),
  llm: llmConfig.default(() => ({ provider: "openai" as const, model: "gpt-4.1-mini" })),
  stt: sttConfig.default(() => ({ engine: "deepgram" as const, language: "en" })),
  tts: ttsConfig.default(() => ({ engine: "kokoro" as const, voice: "af_heart", speed: 1 })),
  idle: idleConfig.default(() => ({ timeout: 5, maxRetries: 2, holdMaxSec: 30 })),
  transfer: transferConfig.default(() => ({ enabled: false, announcement: "", triggerPhrase: "", targets: [] })),
  voicemail: voicemailConfig.default(() => ({
    enabled: false,
    message: "Sorry we couldn't reach you. Please call us back at your convenience. Thank you.",
    responseDelay: 2,
  })),
  ivr: ivrConfig.default(() => ({ enabled: false, navigationPrompt: "" })),
  endCall: endCallConfig.default(() => ({ enabled: false, goodbyeMessage: "", instructions: "", endCallPhrases: [] })),
  vad: vadConfig.default(() => ({ responsiveness: "balanced" as const })),
  toolIds: z.array(z.string()).max(LIMITS.toolIds).default([]),
  // End-of-call analysis questions scored against each call's transcript by this
  // assistant's own LLM (covers inbound + outbound). Edited in the assistant editor.
  analysisQuestions: z.array(analysisQuestionSchema).max(LIMITS.questions).default([]),
  prewarm: z.boolean().default(false),
  created_at: z.string().optional(),
});
export type Assistant = z.infer<typeof assistantSchema>;

export const campaignSchema = z.object({
  id: z.string().optional(),
  assistantId: z.string().min(1),
  // Primary / fallback caller ID. Optional now: when a numberListId is chosen the
  // backend derives this from the list's first member, so the wizard need not send
  // it. Existing single-number campaigns still set it directly.
  fromNumber: z.string().optional(),
  leadIds: z.array(z.string()).default([]),
  // When set, the campaign pulls from this lead list (snapshot-copied on start).
  listId: z.string().optional(),
  // When set, the campaign dials FROM the numbers in this reusable number list.
  numberListId: z.string().optional(),
  // When true, the dialer cycles through the number list (one number per call).
  rotateNumbers: z.boolean().default(false),
  concurrency: z.number().int().min(1).max(5).default(1),
  delayBetweenCalls: z.number().min(0).default(0),
  maxCallDuration: z.number().int().min(10).default(900),
  created_at: z.string().optional(),
});
export type Campaign = z.infer<typeof campaignSchema>;
