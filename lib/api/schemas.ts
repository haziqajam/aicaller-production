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
  provider: z.enum(["openai", "groq", "ollama", "openrouter"]).default("openai"),
  model: z.string().max(LIMITS.model).default("gpt-4.1-mini"),
  // OpenRouter: server-resolved pin id (e.g. "recommended"). Read-only from the
  // backend; the editor sends back whatever was resolved on last save.
  pin: z.string().nullish(),
});
export const sttConfig = z.object({
  // Mirrors caller/models.py STTConfig. The sherpa-onnx ids MUST be listed: this
  // schema parses every assistant the editor loads, so an unlisted engine would
  // be rejected client-side even after the backend accepted the save.
  engine: z
    .enum([
      "deepgram",
      "openai",
      "asrtest",
      "whisper_local",
      "moonshine-base",
      "parakeet-v2",
      "parakeet-v3",
    ])
    .default("deepgram"),
  language: z.string().max(LIMITS.language).default("en"),
  // Whisper-local model size (e.g. "small", "large-v3-turbo"); omitted for other engines.
  // nullish (not just optional): the Base UI Select holds `null` when unselected, and
  // for non-whisper engines this stays null — `.optional()` alone rejects null with
  // "expected string, received null". Backend STTConfig.model is Optional[str]=None.
  model: z.string().max(LIMITS.model).nullish(),
});
export const ttsConfig = z.object({
  // "neutts" mirrors caller/models.py TTSConfig. It MUST be listed here: this
  // schema parses every assistant the editor loads, so an unlisted engine would
  // be rejected client-side even after the backend accepted the save.
  engine: z
    .enum(["kokoro", "piper_urdu", "vibevoice", "deepgram", "neutts"])
    .default("kokoro"),
  // Free-form on purpose — NeuTTS voices are user-cloned, not a fixed engine list.
  voice: z.string().max(LIMITS.voice).default("af_heart"),
  // Speaking-rate multiplier. 1.0 = engine default; honored by kokoro & piper_urdu,
  // ignored by deepgram and neutts. Matches backend TTSConfig.speed (ge 0.5, le 2.0).
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
/**
 * Accent changer — after a transfer, the HUMAN AGENT's speech is re-voiced in a
 * chosen voice before the customer hears it.
 *
 * v2: this is a PER-OWNER setting served by GET/PUT /accent-config, not a field
 * on an assistant. The copy still nested under `transfer` below exists only so a
 * v1 assistant document keeps parsing — nothing writes it and no UI shows it.
 *
 * `sttEngine` / `stopMs` are latency tuning rather than user choices, so the page
 * does not surface them; they round-trip so a stored value is never reset.
 */
export const accentConfig = z.object({
  enabled: z.boolean().default(false),
  ttsEngine: z.enum(["kokoro", "neutts"]).default("kokoro"),
  voice: z.string().max(LIMITS.voice).default("af_heart"),
  sttEngine: z
    .enum(["parakeet-v2", "parakeet-v3", "moonshine-base"])
    .default("parakeet-v2"),
  stopMs: z.number().int().min(40).max(1000).default(100),
  // v2 placement: prefer a cheap CPU accent pod. NeuTTS still forces GPU — it
  // runs below realtime on CPU, so the audio underruns mid-sentence.
  preferCpu: z.boolean().default(true),
  // v1 only; accepted so an older document round-trips. Not read by v2 routing.
  requireGpu: z.boolean().default(true),
});
export type AccentConfig = z.infer<typeof accentConfig>;

/** The accent defaults, so page-level `defaultValues` literals don't restate them. */
export const DEFAULT_ACCENT = accentConfig.parse({});

export const transferConfig = z.object({
  enabled: z.boolean().default(false),
  // v1 location, kept ONLY so a stored assistant still parses. v2 reads the
  // owner's config from /accent-config; nothing writes this and no UI shows it.
  accent: accentConfig.default(() => accentConfig.parse({})),
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
  // Deprecated (engine ignores them) — kept optional so old docs parse.
  message: z.string().max(LIMITS.voicemailMessage).optional(),
  responseDelay: z.number().min(0).max(30).optional(),
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
  // Parsed from {} so every inner default (including accent) comes from the
  // schema itself — hand-listing the fields silently drops new ones.
  transfer: transferConfig.default(() => transferConfig.parse({})),
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

// ─── Pipecat Flows ────────────────────────────────────────────────────────────
// A Flow is a parallel agent type alongside Assistants: a node graph (per-node
// task messages, function transitions, actions) + its own service configs.
// Mirrors caller/models.py (Flow/FlowNode/FlowFunctionDef/FlowAction/FlowMessage)
// and the structural rules in caller/flow_runtime.validate_flow_definition, so
// errors surface inline before the backend 400s.
export const FLOW_LIMITS = {
  name: 120,
  description: 2000,
  nodeName: 80,
  nodes: 50,
  messageContent: 10000,
  functionName: 64,
  functionDescription: 2000,
  functions: 20,
  parameters: 20,
  actions: 5,
  actionText: 2000,
  roleMessages: 5,
  taskMessages: 10,
} as const;

export const flowMessageSchema = z.object({
  role: z.enum(["system", "user", "assistant"]).default("system"),
  content: z.string().min(1, "Message is required").max(FLOW_LIMITS.messageContent),
});
export type FlowMessage = z.infer<typeof flowMessageSchema>;

export const flowFunctionSchema = z.object({
  name: z.string().regex(/^[a-zA-Z_][a-zA-Z0-9_]{0,63}$/, "Use a valid function name (no spaces)"),
  description: z.string().max(FLOW_LIMITS.functionDescription).default(""),
  // transition = pure edge; collect = store args into flow state; http_tool =
  // run one of the owner's reusable HTTP Tools; transfer = hand the caller to
  // a human (real Twilio redirect on phone calls, simulated in browser tests —
  // target/announcement come from the flow's Call features → Transfer).
  kind: z.enum(["transition", "collect", "http_tool", "transfer"]).default("transition"),
  parameters: z.array(toolParam).max(FLOW_LIMITS.parameters).default([]),
  // Target node name. Required for kind=transition (checked in superRefine —
  // node names live at the flow level). Base UI Selects hold null when unset.
  transition_to: z.string().nullish(),
  toolId: z.string().nullish(),   // kind=http_tool
  stateKey: z.string().nullish(), // kind=collect (defaults to name server-side)
});
export type FlowFunction = z.infer<typeof flowFunctionSchema>;

export const flowActionSchema = z.object({
  type: z.enum(["tts_say", "end_conversation"]),
  text: z.string().max(FLOW_LIMITS.actionText).default(""),
});
export type FlowAction = z.infer<typeof flowActionSchema>;

export const flowNodeSchema = z.object({
  name: z.string().min(1, "Node name is required").max(FLOW_LIMITS.nodeName),
  role_messages: z.array(flowMessageSchema).max(FLOW_LIMITS.roleMessages).default([]),
  task_messages: z.array(flowMessageSchema)
    .min(1, "At least one task message is required")
    .max(FLOW_LIMITS.taskMessages),
  functions: z.array(flowFunctionSchema).max(FLOW_LIMITS.functions).default([]),
  pre_actions: z.array(flowActionSchema).max(FLOW_LIMITS.actions).default([]),
  post_actions: z.array(flowActionSchema).max(FLOW_LIMITS.actions).default([]),
  // append = keep context across the transition; reset = fresh context here.
  context_strategy: z.enum(["append", "reset"]).default("append"),
  // On the initial node this is the greeting toggle (bot speaks first or waits).
  respond_immediately: z.boolean().default(true),
});
export type FlowNode = z.infer<typeof flowNodeSchema>;

export const flowSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1, "Name is required").max(FLOW_LIMITS.name),
  description: z.string().max(FLOW_LIMITS.description).default(""),
  initial_node: z.string().min(1, "Pick a starting node"),
  nodes: z.array(flowNodeSchema).min(1, "Add at least one node").max(FLOW_LIMITS.nodes),
  allowInterruptions: z.boolean().default(true),
  llm: llmConfig.default(() => ({ provider: "openai" as const, model: "gpt-4.1-mini" })),
  stt: sttConfig.default(() => ({ engine: "deepgram" as const, language: "en" })),
  tts: ttsConfig.default(() => ({ engine: "kokoro" as const, voice: "af_heart", speed: 1 })),
  idle: idleConfig.default(() => ({ timeout: 5, maxRetries: 2, holdMaxSec: 30 })),
  vad: vadConfig.default(() => ({ responsiveness: "balanced" as const })),
  // Call features — parity with assistants. Transfer feeds node-level
  // `transfer` functions; voicemail/IVR are phone-call-only (inert in the
  // browser test).
  // Parsed from {} so every inner default (including accent) comes from the
  // schema itself — hand-listing the fields silently drops new ones.
  transfer: transferConfig.default(() => transferConfig.parse({})),
  voicemail: voicemailConfig.default(() => ({
    enabled: false,
    message: "Sorry we couldn't reach you. Please call us back at your convenience. Thank you.",
    responseDelay: 2,
  })),
  ivr: ivrConfig.default(() => ({ enabled: false, navigationPrompt: "" })),
  created_at: z.string().optional(),
}).superRefine((flow, ctx) => {
  // A transfer function needs a flow-level target number (mirrors the backend).
  const hasTarget = Boolean(flow.transfer?.targets?.[0]?.number?.trim());
  flow.nodes.forEach((node, ni) => {
    node.functions.forEach((fn, fi) => {
      if (fn.kind === "transfer" && !hasTarget) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["nodes", ni, "functions", fi, "kind"],
          message: "Set a transfer number under Call features first",
        });
      }
    });
  });
  // Mirror caller/flow_runtime.validate_flow_definition so the graph problems
  // surface inline at save time instead of as a backend 400.
  const names = flow.nodes.map((n) => n.name);
  const nameSet = new Set(names);
  const dupes = names.filter((n, i) => names.indexOf(n) !== i);
  if (dupes.length) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["nodes"],
      message: `Duplicate node names: ${[...new Set(dupes)].join(", ")}`,
    });
  }
  if (flow.initial_node && !nameSet.has(flow.initial_node)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["initial_node"],
      message: `Starting node "${flow.initial_node}" doesn't exist`,
    });
  }
  flow.nodes.forEach((node, ni) => {
    node.functions.forEach((fn, fi) => {
      if (fn.transition_to && !nameSet.has(fn.transition_to)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["nodes", ni, "functions", fi, "transition_to"],
          message: `Target node "${fn.transition_to}" doesn't exist`,
        });
      }
      if (fn.kind === "transition" && !fn.transition_to) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["nodes", ni, "functions", fi, "transition_to"],
          message: "A transition needs a target node",
        });
      }
      if (fn.kind === "http_tool" && !fn.toolId) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["nodes", ni, "functions", fi, "toolId"],
          message: "Pick the tool to call",
        });
      }
    });
  });
});
export type Flow = z.infer<typeof flowSchema>;

export const campaignSchema = z.object({
  id: z.string().optional(),
  // The agent driving each call: EXACTLY ONE of assistantId / flowId (mirrors
  // the backend create-route rule). Assistant campaigns are unchanged.
  assistantId: z.string().nullish(),
  flowId: z.string().nullish(),
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
}).superRefine((c, ctx) => {
  if (Boolean(c.assistantId) === Boolean(c.flowId)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["assistantId"],
      message: "Pick exactly one agent: an assistant or a flow",
    });
  }
});
export type Campaign = z.infer<typeof campaignSchema>;
