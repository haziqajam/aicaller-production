"use client";

import { useEffect, useCallback, useRef, useState } from "react";
import { useForm, useWatch, type Resolver } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Form,
  FormField,
  FormItem,
  FormLabel,
  FormControl,
  FormDescription,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { assistantSchema, LIMITS, type Assistant } from "@/lib/api/schemas";
import { Assistants, Voices, Tools, type Voice } from "@/lib/api/resources";
import type { Tool } from "@/lib/api/schemas";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { Catalog } from "@/lib/api/catalog";
import { toastApiError } from "@/lib/api/errors";
import {
  hasDynamicVoices,
  voiceOptionsForEngine,
  voiceOptionsFromVoices,
  type TtsEngine,
} from "@/lib/voice-options";
import {
  modelsForProvider,
  isModelValid,
  modelsFromCatalog,
  languageLabel,
  PROVIDER_LABELS,
  STT_LANGUAGES,
  type LlmProvider,
} from "@/lib/model-options";
import { EngineChain } from "./engine-chain";
import { SaveBar } from "./save-bar";
import {
  IdCard,
  BrainCircuit,
  AudioLines,
  SlidersHorizontal,
  Gauge,
  Wrench,
  Sparkles,
  Zap,
  Server,
  Cpu,
  Waves,
  FlaskConical,
  Volume2,
  Languages,
  Mic,
  Ear,
  MessageSquareText,
  Hourglass,
  PhoneForwarded,
  Globe,
  Voicemail,
  Hash,
  PhoneOff,
  ClipboardList,
  type LucideIcon,
} from "lucide-react";
import { QuestionsEditor } from "@/components/campaign/questions-editor";
import { CloneVoiceDialog } from "@/components/voices/clone-voice-dialog";
import {
  AccentSection,
  useAccentUiVisible,
  type AccentForm,
} from "@/components/accent/accent-section";

interface EditorFormProps {
  assistantId: string | undefined;
  defaultValues: Assistant;
}

/* ─────────────────────────────────────────────────────────────────────────
 * Icon maps — every engine/provider gets a consistent glyph so the user can
 * recognise it across the engine chain, the dropdowns, and the section headers.
 * ──────────────────────────────────────────────────────────────────────── */
const PROVIDER_ICON: Record<LlmProvider, LucideIcon> = {
  openai: Sparkles,
  groq: Zap,
  ollama: Server,
  openrouter: Globe,
};
const STT_ICON: Record<string, LucideIcon> = {
  deepgram: Waves,
  openai: Sparkles,
  asrtest: FlaskConical,
  whisper_local: Languages,
  // sherpa-onnx engines (self-hosted ONNX, one fixed model each).
  "moonshine-base": Ear,
  "parakeet-v2": Cpu,
  "parakeet-v3": Cpu,
};
const TTS_ICON: Record<TtsEngine, LucideIcon> = {
  kokoro: Volume2,
  piper_urdu: Languages,
  vibevoice: Volume2,
  deepgram: Waves,
  neutts: AudioLines,
};

// End-user-facing labels — internal self-hosted engine names (Kokoro, Piper,
// the local Whisper models) are hidden behind capability-based names so the
// user picks by language/capability, not by service.
const STT_LABEL: Record<string, string> = {
  deepgram: "Deepgram",
  openai: "OpenAI Whisper",
  asrtest: "Urdu (Local)",
  whisper_local: "Multilingual (Local)",
  // Only used as the offline fallback + for an engine the catalog no longer
  // returns; the live labels come from GET /api/catalog.
  "moonshine-base": "Moonshine (Local)",
  "parakeet-v2": "Parakeet v2 (Local)",
  "parakeet-v3": "Parakeet v3 (Local)",
};

/* Small cloud vs self-hosted pill shown beside each engine/provider option. */
function TypeBadge({ type }: { type?: "cloud" | "self-hosted" }) {
  if (!type) return null;
  const self = type === "self-hosted";
  return (
    <span
      className={cn(
        "ml-auto rounded-sm border px-1 py-0.5 text-[9px] font-medium",
        self
          ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
          : "border-sky-500/30 bg-sky-500/10 text-sky-400"
      )}
    >
      {self ? "self-hosted" : "cloud"}
    </span>
  );
}
const TTS_LABEL: Record<TtsEngine, string> = {
  kokoro: "English (Local)",
  piper_urdu: "Urdu (Local)",
  vibevoice: "Natural HD (Local)",
  deepgram: "Deepgram Aura",
  neutts: "NeuTTS Nano (Local)",
};

/* Per-section accent tones for the header icon badge — adds visual rhythm. */
const TONE: Record<string, string> = {
  cyan: "border-cyan-500/30 bg-cyan-500/10 text-cyan-400",
  violet: "border-violet-500/30 bg-violet-500/10 text-violet-400",
  emerald: "border-emerald-500/30 bg-emerald-500/10 text-emerald-400",
  amber: "border-amber-500/30 bg-amber-500/10 text-amber-400",
  sky: "border-sky-500/30 bg-sky-500/10 text-sky-400",
  fuchsia: "border-fuchsia-500/30 bg-fuchsia-500/10 text-fuchsia-400",
};

function SectionHeader({
  icon: Icon,
  title,
  description,
  tone = "cyan",
}: {
  icon: LucideIcon;
  title: string;
  description?: string;
  tone?: keyof typeof TONE;
}) {
  return (
    <div className="flex items-start gap-3">
      <span
        className={cn(
          "flex size-9 shrink-0 items-center justify-center rounded-lg border",
          TONE[tone]
        )}
      >
        <Icon className="size-4" />
      </span>
      <div className="min-w-0">
        <h3 className="text-sm font-semibold leading-tight text-foreground">
          {title}
        </h3>
        {description && (
          <p className="mt-1 text-xs leading-snug text-muted-foreground">
            {description}
          </p>
        )}
      </div>
    </div>
  );
}

/** Required-field marker (visual `*` + a screen-reader "(required)"). */
function RequiredMark() {
  return (
    <>
      <span className="text-destructive" aria-hidden>{" *"}</span>
      <span className="sr-only"> (required)</span>
    </>
  );
}

/** Live "used / max" character counter; turns destructive past the cap. */
function CharCount({ value, max }: { value?: string | null; max: number }) {
  const len = value?.length ?? 0;
  return (
    <span className={cn("text-[11px] tabular-nums",
      len > max ? "text-destructive" : "text-muted-foreground/60")}>
      {len.toLocaleString()}/{max.toLocaleString()}
    </span>
  );
}

// Maps a top-level field name to the tab that hosts it, so a save with errors can
// jump the user to the right tab (errors on a hidden tab are otherwise invisible).
const FIELD_TAB: Record<string, string> = {
  name: "identity", systemPrompt: "identity", firstMessage: "identity", firstMessageEnabled: "identity",
  llm: "model",
  stt: "voice", tts: "voice",
  allowInterruptions: "behavior", idle: "behavior", transfer: "behavior",
  voicemail: "behavior", ivr: "behavior", endCall: "behavior",
  toolIds: "tools",
  analysisQuestions: "analysis",
  vad: "advanced", prewarm: "advanced",
};

/**
 * Multi-tab assistant editor.
 * Tabs: Identity | Model | Voice | Behavior | Tools | Analysis | Advanced
 *
 * Voices: engines with a FIXED list (kokoro/piper/vibevoice/deepgram) come from
 * GET /api/catalog, with voice-options.ts as the offline fallback. Engines flagged
 * `dynamicVoices` (NeuTTS) instead read GET /voices — the owner's cloned voices
 * plus the shared builtins — so a newly cloned voice appears with no code change.
 * Models/languages are strict dropdowns sourced from lib/model-options.ts.
 */
export function EditorForm({ assistantId, defaultValues }: EditorFormProps) {
  const isNew = assistantId === undefined;
  const queryClient = useQueryClient();
  // Accent changer UI is gated: its live SIP routing is unproven, so it is
  // admin-only unless NEXT_PUBLIC_ACCENT_UI=1 is baked at build time.
  const accentUiVisible = useAccentUiVisible();

  const form = useForm<Assistant>({
    // zodResolver input/output types differ in zod v4; cast to satisfy RHF
    resolver: zodResolver(assistantSchema) as Resolver<Assistant>,
    defaultValues,
    mode: "onChange",
  });

  const {
    formState: { isDirty, isSubmitting },
    control,
    setValue,
    getValues,
  } = form;

  // Set true right before an intentional save-navigation so the dirty-state
  // `beforeunload` guard below doesn't pop the browser "Leave site?" prompt on
  // a successful save (the create path does a full-page nav while the form is
  // still technically dirty). Read live in the handler, so no stale closure.
  const suppressUnloadGuard = useRef(false);

  /** Real submit handler — called by RHF after validation passes */
  const saveData = useCallback(
    async (data: Assistant) => {
      try {
        if (isNew) {
          const { id } = await Assistants.create(data);
          if (data.prewarm && id) {
            await Assistants.prewarm(id);
            toast.success("Assistant created and prewarmed");
          } else {
            toast.success("Assistant created");
          }
          // Navigate to the new assistant's edit page. Suppress the unsaved-
          // changes guard first so this intentional full-page nav doesn't pop
          // the browser "Leave site?" prompt even though the save succeeded.
          suppressUnloadGuard.current = true;
          window.location.href = `/assistants/${id}`;
        } else {
          await Assistants.update(assistantId, data);
          if (data.prewarm) {
            await Assistants.prewarm(assistantId);
            toast.success("Saved and prewarmed STT & TTS");
          } else {
            toast.success("Assistant saved");
          }
          form.reset(data);
        }
      } catch (err: unknown) {
        toastApiError(err, "Couldn't save assistant");
      }
    },
    [isNew, assistantId, form]
  );

  // Controlled tabs so a save-with-errors can switch to the errored tab.
  const [activeTab, setActiveTab] = useState("identity");

  /** Stable callback passed to SaveBar's onClick. On validation failure, jump to
   *  the tab holding the first errored field and focus it — errors on a hidden
   *  tab are otherwise invisible (only a toast would show). */
  const handleSave = useCallback(
    () =>
      form.handleSubmit(saveData, (errors) => {
        const firstKey = Object.keys(errors)[0];
        if (!firstKey) return;
        setActiveTab(FIELD_TAB[firstKey] ?? "identity");
        // setFocus works for top-level string fields (name/systemPrompt); a nested
        // path (e.g. "transfer") just no-ops — the tab switch still helps.
        try { form.setFocus(firstKey as never); } catch { /* ignore */ }
      })(),
    [form, saveData]
  );

  // Warn on browser close/reload when dirty
  useEffect(() => {
    function onBeforeUnload(e: BeforeUnloadEvent) {
      if (isDirty && !suppressUnloadGuard.current) {
        e.preventDefault();
        e.returnValue = "";
      }
    }
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [isDirty]);

  // Watch live values for engine chain + voice validation
  const llmProvider = useWatch({ control, name: "llm.provider" });
  const llmModel = useWatch({ control, name: "llm.model" });
  const firstMessageEnabled = useWatch({ control, name: "firstMessageEnabled" });
  const sttEngine = useWatch({ control, name: "stt.engine" });
  const ttsEngine = useWatch({ control, name: "tts.engine" }) as TtsEngine;
  const ttsVoice = useWatch({ control, name: "tts.voice" });
  const prewarm = useWatch({ control, name: "prewarm" });
  const idleTimeout = useWatch({ control, name: "idle.timeout" });
  const idleHoldMaxSec = useWatch({ control, name: "idle.holdMaxSec" });
  const transferEnabled = useWatch({ control, name: "transfer.enabled" });
  const ivrEnabled = useWatch({ control, name: "ivr.enabled" });
  const endCallEnabled = useWatch({ control, name: "endCall.enabled" });

  // There is exactly ONE transfer target. Normalise the array to a single slot
  // whenever transfer is enabled — this also collapses legacy assistants that
  // were saved with multiple targets down to the first one.
  useEffect(() => {
    if (!transferEnabled) return;
    const t = getValues("transfer.targets") ?? [];
    if (t.length !== 1) {
      setValue("transfer.targets", [t[0] ?? { number: "", whisperTemplate: "" }], {
        shouldDirty: false,
      });
    }
  }, [transferEnabled, getValues, setValue]);

  // The user's custom HTTP tools, for the Tools tab attach list.
  const { data: userTools } = useQuery<Tool[]>({
    queryKey: ["tools"],
    queryFn: Tools.list,
    staleTime: 60 * 1000,
  });

  // Runtime voice catalog from backend — replaces seed data when available
  const { data: rawCatalog } = useQuery({
    queryKey: ["voices"],
    queryFn: Voices.catalog,
    staleTime: 5 * 60 * 1000, // 5 min
  });

  // Normalize catalog to Record<string, string[]>
  const runtimeCatalog: Record<string, string[]> | undefined =
    rawCatalog && typeof rawCatalog === "object" && !Array.isArray(rawCatalog)
      ? (rawCatalog as Record<string, string[]>)
      : undefined;

  // Backend catalog — single source of truth for engines/providers + lists.
  const { data: catalog } = useQuery({
    queryKey: ["catalog"],
    queryFn: Catalog.get,
    staleTime: 5 * 60 * 1000,
  });
  const llmProviders = catalog?.llm;
  const sttEngines = catalog?.stt;
  const ttsEngines = catalog?.tts;

  // Engines whose voices are per-owner rows (NeuTTS) rather than a fixed list.
  const dynamicVoices = hasDynamicVoices(ttsEngines, ttsEngine);
  // The owner's cloned voices + the global builtins. Short staleTime because a
  // clone finishing an encode must show up without a reload; the clone dialog
  // also invalidates ["voices", engine] the moment one turns ready.
  const { data: engineVoices, isPending: voicesPending } = useQuery({
    queryKey: ["voices", ttsEngine],
    queryFn: () => Voices.list(ttsEngine),
    enabled: dynamicVoices,
    staleTime: 30 * 1000,
  });

  // New assistant: the hardcoded defaults (openai / deepgram) can be ABOVE the
  // user's tier, which the tier-filtered catalog omits — so a low-tier user
  // saving with the defaults would hit a 403. Snap each engine to the first
  // ALLOWED catalog option (only when the current value isn't offered). Never
  // runs for an existing assistant (don't rewrite a saved config).
  useEffect(() => {
    if (!isNew || !catalog) return;
    const llm = catalog.llm ?? [];
    const stt = catalog.stt ?? [];
    const tts = catalog.tts ?? [];
    if (llm.length && !llm.some((p) => p.id === llmProvider)) {
      const p = llm[0];
      setValue("llm.provider", p.id as Assistant["llm"]["provider"], { shouldDirty: false });
      if (p.models?.[0]) setValue("llm.model", p.models[0].id, { shouldDirty: false });
    }
    if (stt.length && !stt.some((e) => e.id === sttEngine)) {
      setValue("stt.engine", stt[0].id as Assistant["stt"]["engine"], { shouldDirty: false });
    }
    if (tts.length && !tts.some((e) => e.id === ttsEngine)) {
      const t = tts[0];
      setValue("tts.engine", t.id as Assistant["tts"]["engine"], { shouldDirty: false });
      if (t.voices?.[0]) setValue("tts.voice", t.voices[0], { shouldDirty: false });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isNew, catalog]);

  // Watch the Whisper-local model size (only meaningful for that engine).
  const sttModel = useWatch({ control, name: "stt.model" });

  // Live model overlay for providers flagged `live` (groq / ollama).
  const providerInfo = llmProviders?.find((p) => p.id === llmProvider);
  const { data: liveModels } = useQuery({
    queryKey: ["provider-models", llmProvider],
    queryFn: () => Catalog.providerModels(llmProvider),
    enabled: !!providerInfo?.live,
    staleTime: 60 * 60 * 1000,
  });

  // Selectable option lists — catalog-driven, with the static seeds as the
  // offline fallback so the editor still works if /api/catalog is unreachable.
  const llmProviderOptions: { id: string; label: string; type?: "cloud" | "self-hosted" }[] =
    llmProviders?.map((p) => ({ id: p.id, label: p.label, type: p.type })) ??
    (Object.keys(PROVIDER_LABELS) as LlmProvider[]).map((id) => ({
      id,
      label: PROVIDER_LABELS[id],
    }));
  const sttEngineOptions: { id: string; label: string; type?: "cloud" | "self-hosted" }[] =
    sttEngines?.map((e) => ({ id: e.id, label: e.label, type: e.type })) ??
    (["deepgram", "openai", "asrtest"] as const).map((id) => ({
      id,
      label: STT_LABEL[id],
    }));
  const ttsEngineOptions: { id: string; label: string; type?: "cloud" | "self-hosted" }[] =
    ttsEngines?.map((e) => ({ id: e.id, label: e.label, type: e.type })) ??
    (["kokoro", "piper_urdu", "vibevoice", "deepgram"] as TtsEngine[]).map((id) => ({
      id,
      label: TTS_LABEL[id],
    }));

  const sttEngineInfo = sttEngines?.find((e) => e.id === sttEngine);
  const sttLanguages = sttEngineInfo?.languages ?? STT_LANGUAGES.map((l) => l.value);
  const whisperSizes = sttEngineInfo?.modelSizes;
  const isWhisperLocal = sttEngine === "whisper_local";

  // Friendly, end-user-facing engine names (never expose internal service ids
  // like "piper_urdu" / "whisper_local" in the UI).
  const sttEngineLabel =
    sttEngineOptions.find((e) => e.id === sttEngine)?.label ??
    STT_LABEL[sttEngine] ??
    sttEngine;
  const ttsEngineLabel =
    ttsEngineOptions.find((e) => e.id === ttsEngine)?.label ??
    TTS_LABEL[ttsEngine as TtsEngine] ??
    ttsEngine;

  // One option list for BOTH kinds of engine: fixed lists come from the catalog
  // seed, dynamic ones from the /voices rows (with encoding/failed clones listed
  // but disabled).
  const voiceOptions = voiceOptionsForEngine(ttsEngines, ttsEngine, {
    voices: engineVoices,
    runtimeCatalog,
  });
  // A saved voice counts as valid if it's in the list at ALL — a clone that is
  // still encoding is a legitimate saved selection, just not re-selectable yet.
  // While a dynamic list is still loading the list is empty, so suppress the
  // warning entirely rather than flashing "not compatible" on every open.
  const voiceListReady = !dynamicVoices || !voicesPending;
  const voiceIsValid = voiceOptions.some((o) => o.value === ttsVoice);
  const voiceItems = Object.fromEntries(
    voiceOptions.map((o) => [o.value, o.label])
  );
  const availableModels = modelsFromCatalog(
    llmProviders,
    llmProvider,
    liveModels?.models
  );

  // Base UI Select shows the raw `value` in the CLOSED trigger unless given an
  // `items` value→label map. Without these the trigger would read e.g.
  // "asrtest" / "llama-3.3-70b-versatile" instead of the friendly label. The
  // stored value stays the engine/model id — this only affects display.
  const providerItems = Object.fromEntries(
    llmProviderOptions.map((o) => [o.id, o.label])
  );
  const modelItems = Object.fromEntries(
    availableModels.map((m) => [m.value, m.label])
  );
  const sttEngineItems = Object.fromEntries(
    sttEngineOptions.map((o) => [o.id, o.label])
  );
  const ttsEngineItems = Object.fromEntries(
    ttsEngineOptions.map((o) => [o.id, o.label])
  );
  const languageItems = Object.fromEntries(
    sttLanguages.map((code) => [code, languageLabel(code)])
  );

  // NOTE: the "snap model to a valid choice for the provider" and "reset voice when the
  // TTS engine changes" repairs are driven by the Select's onValueChange (real user
  // interaction) — NOT by a value-watching effect. An effect can't tell a genuine
  // provider switch from React hydrating the form (useWatch yields undefined on the
  // first render, then the saved value), so it would clobber a freshly-loaded model —
  // especially a "live" groq/ollama model the static seed doesn't list — with the seed
  // default and falsely dirty the form. onValueChange only fires when the user picks.

  /** Snap the model to a valid choice for a newly-picked provider. */
  const onProviderChange = useCallback(
    (provider: LlmProvider | null) => {
      if (!provider) return;
      setValue("llm.provider", provider, { shouldDirty: true });
      const models = modelsForProvider(provider);
      // openrouter has no static seed (models=[]) — fall back to the catalog's
      // default-first list so the form never keeps a stale cross-provider model id.
      const effectiveModels = models.length > 0 ? models : modelsFromCatalog(llmProviders, provider);
      if (!isModelValid(provider, getValues("llm.model")) && effectiveModels.length > 0) {
        setValue("llm.model", effectiveModels[0].value, { shouldDirty: true });
      }
    },
    [setValue, getValues, llmProviders]
  );


  /** Drop the whisper-only model size when moving to an engine that has none.
      Driven by the Select's onValueChange (a real user action), NOT an effect —
      an effect can't tell a genuine switch from React hydrating the form, so it
      would clear a saved value and falsely dirty the form on open. */
  const onSttEngineChange = useCallback(
    (engine: string | null) => {
      if (!engine) return;
      setValue("stt.engine", engine as Assistant["stt"]["engine"], {
        shouldDirty: true,
      });
      const sizes = sttEngines?.find((e) => e.id === engine)?.modelSizes;
      if (!sizes?.length && getValues("stt.model")) {
        // The sherpa engines are one fixed model each; leaving e.g.
        // "large-v3-turbo" behind would store a size that means nothing.
        setValue("stt.model", null, { shouldDirty: true });
      }
    },
    [setValue, getValues, sttEngines]
  );

  /** Reset the voice to the first valid option for a newly-picked TTS engine. */
  const onTtsEngineChange = useCallback(
    (engine: TtsEngine | null) => {
      if (!engine) return;
      setValue("tts.engine", engine, { shouldDirty: true });
      // For a dynamic engine the /voices query for THIS engine may not have run
      // yet (the key includes the engine id), so `queryClient.getQueryData` is
      // the only list available synchronously — undefined means "leave the voice
      // alone"; the repair effect below fixes it once the rows arrive.
      const options = voiceOptionsForEngine(ttsEngines, engine, {
        voices: queryClient.getQueryData<Voice[]>(["voices", engine]),
        runtimeCatalog,
      });
      const selectable = options.filter((o) => !o.disabled);
      if (
        selectable.length > 0 &&
        !options.some((o) => o.value === getValues("tts.voice"))
      ) {
        setValue("tts.voice", selectable[0].value, { shouldDirty: true });
      }
    },
    [setValue, getValues, ttsEngines, runtimeCatalog, queryClient]
  );

  // Repair the voice once a DYNAMIC engine's rows land: switching to NeuTTS
  // leaves the previous engine's voice in place until GET /voices resolves, and
  // saving that would store e.g. "af_heart" on a neutts assistant. Only fires
  // when the query has actually settled and the current value is not in the list.
  useEffect(() => {
    if (!dynamicVoices || voicesPending) return;
    const options = voiceOptionsFromVoices(engineVoices);
    const selectable = options.filter((o) => !o.disabled);
    const current = getValues("tts.voice");
    if (selectable.length > 0 && !options.some((o) => o.value === current)) {
      setValue("tts.voice", selectable[0].value, { shouldDirty: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dynamicVoices, voicesPending, engineVoices]);

  // When Whisper-local is selected, default/repair the model size.
  useEffect(() => {
    if (isWhisperLocal && whisperSizes && whisperSizes.length > 0) {
      if (!sttModel || !whisperSizes.includes(sttModel)) {
        setValue("stt.model", whisperSizes[0], { shouldDirty: true });
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sttEngine, whisperSizes]);

  return (
    <>
      <Form {...form}>
        <form className="space-y-6">
          {/* Live engine chain visual */}
          <EngineChain
            llmProvider={llmProvider}
            llmModel={llmModel}
            sttEngine={sttEngineLabel}
            ttsEngine={ttsEngineLabel}
            voice={ttsVoice}
          />

          <Tabs value={activeTab} onValueChange={setActiveTab}>
            {/* Horizontally scrollable tab list on narrow screens */}
            <div className="overflow-x-auto">
              <TabsList className="min-w-max">
                <TabsTrigger value="identity" className="gap-1.5">
                  <IdCard className="size-3.5" />
                  Identity
                </TabsTrigger>
                <TabsTrigger value="model" className="gap-1.5">
                  <BrainCircuit className="size-3.5" />
                  Model
                </TabsTrigger>
                <TabsTrigger value="voice" className="gap-1.5">
                  <AudioLines className="size-3.5" />
                  Voice
                </TabsTrigger>
                <TabsTrigger value="behavior" className="gap-1.5">
                  <SlidersHorizontal className="size-3.5" />
                  Behavior
                </TabsTrigger>
                <TabsTrigger value="tools" className="gap-1.5">
                  <Wrench className="size-3.5" />
                  Tools
                </TabsTrigger>
                <TabsTrigger value="analysis" className="gap-1.5">
                  <ClipboardList className="size-3.5" />
                  Analysis
                </TabsTrigger>
                <TabsTrigger value="advanced" className="gap-1.5">
                  <Gauge className="size-3.5" />
                  Advanced
                </TabsTrigger>
              </TabsList>
            </div>

            {/* ── Identity tab ─────────────────────────────────── */}
            <TabsContent value="identity" className="mt-4 space-y-4">
              <FormField
                control={control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <div className="flex items-center justify-between gap-2">
                      <FormLabel>Name<RequiredMark /></FormLabel>
                      <CharCount value={field.value} max={LIMITS.name} />
                    </div>
                    <FormControl>
                      <Input placeholder="Sales Bot" maxLength={LIMITS.name} {...field} />
                    </FormControl>
                    <FormDescription>
                      Internal label for this assistant — not heard by callers.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={control}
                name="systemPrompt"
                render={({ field }) => (
                  <FormItem>
                    <div className="flex items-center justify-between gap-2">
                      <FormLabel>System prompt<RequiredMark /></FormLabel>
                      <CharCount value={field.value} max={LIMITS.systemPrompt} />
                    </div>
                    <FormControl>
                      <Textarea
                        placeholder="You are a helpful sales assistant…"
                        className="min-h-48"
                        maxLength={LIMITS.systemPrompt}
                        {...field}
                      />
                    </FormControl>
                    <FormDescription>
                      Instructions that shape the assistant&apos;s persona and
                      goals throughout the call.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={control}
                name="firstMessageEnabled"
                render={({ field }) => (
                  <FormItem className="flex items-center justify-between gap-4 rounded-lg border p-3">
                    <div className="space-y-0.5">
                      <FormLabel className="flex items-center gap-1.5">
                        {field.value ? (
                          <MessageSquareText className="size-3.5 text-primary" />
                        ) : (
                          <Mic className="size-3.5 text-muted-foreground" />
                        )}
                        {field.value ? "AI speaks first" : "Caller speaks first"}
                      </FormLabel>
                      <FormDescription>
                        {field.value
                          ? "The assistant opens the call with the message below."
                          : "The assistant stays silent on connect and waits for the caller to speak."}
                      </FormDescription>
                    </div>
                    <FormControl>
                      <Switch
                        checked={field.value}
                        onCheckedChange={field.onChange}
                      />
                    </FormControl>
                  </FormItem>
                )}
              />

              <FormField
                control={control}
                name="firstMessage"
                render={({ field }) => (
                  <FormItem className={cn(!firstMessageEnabled && "opacity-60")}>
                    <div className="flex items-center justify-between gap-2">
                      <FormLabel>Opening message</FormLabel>
                      {firstMessageEnabled && <CharCount value={field.value} max={LIMITS.firstMessage} />}
                    </div>
                    <FormControl>
                      <Textarea
                        placeholder="Hi, this is an AI assistant calling about…"
                        className="min-h-20"
                        maxLength={LIMITS.firstMessage}
                        disabled={!firstMessageEnabled}
                        {...field}
                      />
                    </FormControl>
                    <FormDescription>
                      {firstMessageEnabled
                        ? "The first thing the assistant says when the call connects."
                        : "Disabled — turn on “AI speaks first” to set an opening message."}
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </TabsContent>

            {/* ── Model tab ─────────────────────────────────────── */}
            <TabsContent value="model" className="mt-4 space-y-4">
              <Card>
                <CardHeader className="pb-3">
                  <SectionHeader
                    icon={BrainCircuit}
                    title="Language model"
                    description="The brain that decides what the assistant says. Pick a provider, then one of its supported models."
                    tone="cyan"
                  />
                </CardHeader>
                <CardContent className="space-y-4">
                  <FormField
                    control={control}
                    name="llm.provider"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Provider</FormLabel>
                        <Select
                          items={providerItems}
                          value={field.value}
                          onValueChange={onProviderChange}
                        >
                          <FormControl>
                            <SelectTrigger className="w-full">
                              <SelectValue placeholder="Select provider" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {llmProviderOptions.map((p) => {
                              const Icon =
                                PROVIDER_ICON[p.id as LlmProvider] ?? Server;
                              return (
                                <SelectItem key={p.id} value={p.id}>
                                  <Icon className="size-3.5 text-muted-foreground" />
                                  {p.label}
                                  <TypeBadge type={p.type} />
                                </SelectItem>
                              );
                            })}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={control}
                    name="llm.model"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Model</FormLabel>
                        <Select
                          items={modelItems}
                          value={field.value}
                          onValueChange={field.onChange}
                        >
                          <FormControl>
                            <SelectTrigger className="w-full">
                              <SelectValue placeholder="Select a model" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {availableModels.map((m) => (
                              <SelectItem key={m.value} value={m.value}>
                                <Cpu className="size-3.5 text-muted-foreground" />
                                <span className="font-medium">{m.label}</span>
                                {m.hint && (
                                  <span className="text-[11px] text-muted-foreground">
                                    {m.hint}
                                  </span>
                                )}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormDescription>
                          Only models supported by{" "}
                          <span className="font-medium text-foreground/80">
                            {PROVIDER_LABELS[llmProvider as LlmProvider] ??
                              llmProvider}
                          </span>{" "}
                          are shown. Ollama models must be pulled on the Ollama
                          host first.
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </CardContent>
              </Card>
            </TabsContent>

            {/* ── Voice tab ─────────────────────────────────────── */}
            <TabsContent value="voice" className="mt-4 space-y-4">
              <Card>
                <CardHeader className="pb-3">
                  <SectionHeader
                    icon={Ear}
                    title="Speech-to-text (STT)"
                    description="Transcribes the caller's speech into text the model can read."
                    tone="violet"
                  />
                </CardHeader>
                <CardContent className="space-y-4">
                  <FormField
                    control={control}
                    name="stt.engine"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Engine</FormLabel>
                        <Select
                          items={sttEngineItems}
                          value={field.value}
                          onValueChange={onSttEngineChange}
                        >
                          <FormControl>
                            <SelectTrigger className="w-full">
                              <SelectValue placeholder="Select STT engine" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {sttEngineOptions.map((e) => {
                              const Icon = STT_ICON[e.id] ?? Mic;
                              return (
                                <SelectItem key={e.id} value={e.id}>
                                  <Icon className="size-3.5 text-muted-foreground" />
                                  {e.label}
                                  <TypeBadge type={e.type} />
                                </SelectItem>
                              );
                            })}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={control}
                    name="stt.language"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Language</FormLabel>
                        <Select
                          items={languageItems}
                          value={field.value}
                          onValueChange={field.onChange}
                        >
                          <FormControl>
                            <SelectTrigger className="w-full">
                              <SelectValue placeholder="Select language" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {sttLanguages.map((code) => (
                              <SelectItem key={code} value={code}>
                                <Globe className="size-3.5 text-muted-foreground" />
                                {languageLabel(code)}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormDescription>
                          Language the transcriber should expect from the caller
                          {isWhisperLocal
                            ? " (“Auto-detect” lets Whisper identify it)."
                            : "."}
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  {/* Whisper-local only: pick the faster-whisper model size. */}
                  {isWhisperLocal && (
                    <FormField
                      control={control}
                      name="stt.model"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Model size</FormLabel>
                          <Select
                            value={field.value ?? ""}
                            onValueChange={field.onChange}
                          >
                            <FormControl>
                              <SelectTrigger className="w-full">
                                <SelectValue placeholder="Select model size" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {(whisperSizes ?? []).map((size) => (
                                <SelectItem key={size} value={size}>
                                  <Cpu className="size-3.5 text-muted-foreground" />
                                  {size}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <FormDescription>
                            Bigger models are more accurate but slower. Runs
                            self-hosted on the server&apos;s GPU.
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-3">
                  <SectionHeader
                    icon={AudioLines}
                    title="Text-to-speech (TTS)"
                    description="Turns the model's replies into the voice the caller hears. The engine determines which voices are available."
                    tone="emerald"
                  />
                </CardHeader>
                <CardContent className="space-y-4">
                  <FormField
                    control={control}
                    name="tts.engine"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Engine</FormLabel>
                        <Select
                          items={ttsEngineItems}
                          value={field.value}
                          onValueChange={onTtsEngineChange}
                        >
                          <FormControl>
                            <SelectTrigger className="w-full">
                              <SelectValue placeholder="Select TTS engine" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {ttsEngineOptions.map((e) => {
                              const Icon = TTS_ICON[e.id as TtsEngine] ?? Volume2;
                              return (
                                <SelectItem key={e.id} value={e.id}>
                                  <Icon className="size-3.5 text-muted-foreground" />
                                  {e.label}
                                  <TypeBadge type={e.type} />
                                </SelectItem>
                              );
                            })}
                          </SelectContent>
                        </Select>
                        <FormDescription>
                          Switching engines resets the voice selection below.
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={control}
                    name="tts.voice"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Voice</FormLabel>
                        <Select
                          items={voiceItems}
                          value={field.value}
                          onValueChange={field.onChange}
                        >
                          <FormControl>
                            <SelectTrigger className="w-full">
                              <SelectValue
                                placeholder={
                                  dynamicVoices && voicesPending
                                    ? "Loading voices…"
                                    : "Select voice"
                                }
                              />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {voiceOptions.map((v) => (
                              <SelectItem
                                key={v.value}
                                value={v.value}
                                disabled={v.disabled}
                              >
                                <Mic className="size-3.5 text-muted-foreground" />
                                {v.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>

                        {/* Explain invalid combo — never silently allow it.
                            Suppressed while a dynamic list is still loading, or
                            the empty list would flag every saved voice as wrong. */}
                        {voiceListReady && !voiceIsValid && ttsVoice && (
                          <p className="text-xs text-warning mt-1">
                            Voice &ldquo;{ttsVoice}&rdquo; is not compatible
                            with the{" "}
                            <strong className="font-medium">{ttsEngineLabel}</strong>{" "}
                            voice option. Select a voice from the list above.
                          </p>
                        )}

                        <FormDescription className="flex flex-wrap items-center gap-x-1.5 gap-y-1">
                          <span>
                            Voices available for{" "}
                            <span className="tabular rounded-sm border border-border bg-muted/60 px-1 py-0.5 text-[10px] font-medium text-foreground/80">
                              {ttsEngineLabel}
                            </span>
                          </span>
                          {/* Cloning only exists for engines with per-owner
                              voices — offering it on a fixed-list engine would
                              promise something the backend can't do. */}
                          {dynamicVoices && (
                            <CloneVoiceDialog
                              engine={ttsEngine}
                              trigger={
                                <Button
                                  type="button"
                                  variant="link"
                                  size="sm"
                                  className="h-auto p-0 text-xs"
                                />
                              }
                            />
                          )}
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  {/* Voice speed — honored by kokoro & piper_urdu. deepgram (Aura),
                      vibevoice, and neutts (llama.cpp sampling) have no rate
                      param, so hide it there rather than show a dead control. */}
                  {ttsEngine !== "deepgram" &&
                    ttsEngine !== "vibevoice" &&
                    ttsEngine !== "neutts" && (
                    <FormField
                      control={control}
                      name="tts.speed"
                      render={({ field }) => (
                        <FormItem>
                          <div className="flex items-center justify-between">
                            <FormLabel>Speaking speed</FormLabel>
                            <span className="text-sm tabular-nums text-muted-foreground">
                              {Number(field.value ?? 1).toFixed(1)}×
                            </span>
                          </div>
                          <FormControl>
                            <Slider
                              min={0.5}
                              max={2}
                              step={0.1}
                              value={field.value as number}
                              onValueChange={(v) =>
                                field.onChange(typeof v === "number" ? v : (v as readonly number[])[0])
                              }
                            />
                          </FormControl>
                          <FormDescription>
                            How fast the assistant speaks. 1.0× is the default rate.
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {/* ── Behavior tab ──────────────────────────────────── */}
            <TabsContent value="behavior" className="mt-4 space-y-4">
              <Card>
                <CardHeader className="pb-3">
                  <SectionHeader
                    icon={Ear}
                    title="Interruptions"
                    description="Whether the caller can talk over the assistant and cut it off mid-sentence."
                    tone="violet"
                  />
                </CardHeader>
                <CardContent>
                  <FormField
                    control={control}
                    name="allowInterruptions"
                    render={({ field }) => (
                      <FormItem className="flex items-center justify-between gap-4 rounded-lg border p-3">
                        <div className="space-y-0.5">
                          <FormLabel className="flex items-center gap-1.5">
                            <Ear
                              className={
                                field.value
                                  ? "size-3.5 text-primary"
                                  : "size-3.5 text-muted-foreground"
                              }
                            />
                            {field.value
                              ? "Caller can interrupt"
                              : "Bot speaks uninterrupted"}
                          </FormLabel>
                          <FormDescription>
                            {field.value
                              ? "If the caller starts speaking while the assistant is talking, the assistant stops and listens (barge-in)."
                              : "The assistant finishes speaking before listening; the caller cannot cut it off."}
                          </FormDescription>
                        </div>
                        <FormControl>
                          <Switch
                            checked={field.value}
                            onCheckedChange={field.onChange}
                          />
                        </FormControl>
                      </FormItem>
                    )}
                  />
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-3">
                  <SectionHeader
                    icon={Hourglass}
                    title="Idle / hold settings"
                    description="How the assistant reacts to silence and how long callers can wait on hold."
                    tone="amber"
                  />
                </CardHeader>
                <CardContent className="space-y-6">
                  <FormField
                    control={control}
                    name="idle.timeout"
                    render={({ field }) => (
                      <FormItem>
                        <div className="flex items-center justify-between">
                          <FormLabel>Silence timeout</FormLabel>
                          <span className="text-sm tabular-nums text-muted-foreground">
                            {idleTimeout}s
                          </span>
                        </div>
                        <FormControl>
                          <Slider
                            min={1}
                            max={30}
                            value={field.value as number}
                            onValueChange={(v) =>
                              field.onChange(typeof v === "number" ? v : (v as readonly number[])[0])
                            }
                          />
                        </FormControl>
                        <FormDescription>
                          Seconds of silence before the assistant prompts the
                          caller again.
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={control}
                    name="idle.maxRetries"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Max idle retries</FormLabel>
                        <FormControl>
                          <Input
                            type="number"
                            min={0}
                            max={10}
                            {...field}
                            onChange={(e) =>
                              field.onChange(parseInt(e.target.value, 10))
                            }
                          />
                        </FormControl>
                        <FormDescription>
                          How many times to retry before ending the call.
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={control}
                    name="idle.holdMaxSec"
                    render={({ field }) => (
                      <FormItem>
                        <div className="flex items-center justify-between">
                          <FormLabel>Idle pause after a hold phrase</FormLabel>
                          <span className="text-sm tabular-nums text-muted-foreground">
                            {idleHoldMaxSec}s
                          </span>
                        </div>
                        <FormControl>
                          <Slider
                            min={5}
                            max={120}
                            value={field.value as number}
                            onValueChange={(v) =>
                              field.onChange(typeof v === "number" ? v : (v as readonly number[])[0])
                            }
                          />
                        </FormControl>
                        <FormDescription>
                          When the caller says a hold phrase (e.g. &ldquo;hold on&rdquo;,
                          &ldquo;one moment&rdquo;), the assistant pauses its
                          &ldquo;are you still there?&rdquo; checks. They resume after
                          this many seconds of silence — or immediately if the caller
                          says anything else.
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-3">
                  <SectionHeader
                    icon={PhoneForwarded}
                    title="Call transfer"
                    description="Hand the call off to a human agent when the caller asks."
                    tone="sky"
                  />
                </CardHeader>
                <CardContent className="space-y-4">
                  <FormField
                    control={control}
                    name="transfer.enabled"
                    render={({ field }) => (
                      <FormItem className="flex items-center justify-between rounded-lg border p-3">
                        <div>
                          <FormLabel>Enable transfer</FormLabel>
                          <FormDescription>
                            Allow this assistant to transfer calls to a human
                            agent.
                          </FormDescription>
                        </div>
                        <FormControl>
                          <Switch
                            checked={field.value}
                            onCheckedChange={field.onChange}
                          />
                        </FormControl>
                      </FormItem>
                    )}
                  />

                  {transferEnabled && (
                    <div className="space-y-4">
                      <FormField
                        control={control}
                        name="transfer.targets.0.number"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Agent phone number</FormLabel>
                            <FormDescription>
                              The call is handed off to this number. Use E.164
                              format (e.g. +15550001111).
                            </FormDescription>
                            <FormControl>
                              <Input
                                placeholder="+15550001111"
                                {...field}
                                value={field.value ?? ""}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={control}
                        name="transfer.triggerPhrase"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Trigger phrase</FormLabel>
                            <FormDescription>
                              When the caller expresses this, the assistant
                              transfers the call. Matched by intent, not
                              word-for-word.
                            </FormDescription>
                            <FormControl>
                              <Textarea
                                rows={2}
                                placeholder="e.g. speak to a human, talk to an agent, transfer me to a representative"
                                {...field}
                                value={field.value ?? ""}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={control}
                        name="transfer.announcement"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Transfer announcement</FormLabel>
                            <FormDescription>
                              Spoken to the caller right before the hand-off.
                              Leave blank to use the default (&ldquo;Please hold
                              while I connect you.&rdquo;).
                            </FormDescription>
                            <FormControl>
                              <Textarea
                                rows={2}
                                placeholder="e.g. Sure — please hold while I connect you to an agent."
                                {...field}
                                value={field.value ?? ""}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={control}
                        name="transfer.targets.0.whisperTemplate"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Whisper to agent (optional)</FormLabel>
                            <FormDescription>
                              Played to the agent when they answer, before the
                              caller is connected — useful for passing call
                              context.
                            </FormDescription>
                            <FormControl>
                              <Textarea
                                rows={2}
                                placeholder="e.g. Incoming transfer — caller is asking about their order status."
                                {...field}
                                value={field.value ?? ""}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      {/* Accent changer — only meaningful once a transfer happens,
                          so it lives inside the transfer-enabled block. */}
                      {accentUiVisible && (
                        <AccentSection
                          // cast: react-hook-form's UseFormReturn is invariant —
                          // see AccentForm in accent-section.tsx.
                          form={form as unknown as AccentForm}
                          ttsEngines={ttsEngines}
                        />
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-3">
                  <SectionHeader
                    icon={Voicemail}
                    title="Voicemail detection"
                    description={'Detect answering machines and phone menus. On voicemail the call ends and is recorded as “voicemail”; menus are navigated automatically to reach a human.'}
                    tone="cyan"
                  />
                </CardHeader>
                <CardContent className="space-y-4">
                  <FormField
                    control={control}
                    name="voicemail.enabled"
                    render={({ field }) => (
                      <FormItem className="flex items-center justify-between rounded-lg border p-3">
                        <div>
                          <FormLabel>Detect voicemail</FormLabel>
                          <FormDescription>
                            Detect answering machines and phone menus. On voicemail the call ends and is
                            recorded as &ldquo;voicemail&rdquo;; menus are navigated automatically to reach a human.
                          </FormDescription>
                        </div>
                        <FormControl>
                          <Switch
                            checked={field.value}
                            onCheckedChange={field.onChange}
                          />
                        </FormControl>
                      </FormItem>
                    )}
                  />
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-3">
                  <SectionHeader
                    icon={Hash}
                    title="IVR navigation"
                    description="Let the assistant press keypad digits to get through automated phone menus on outbound calls."
                    tone="emerald"
                  />
                </CardHeader>
                <CardContent className="space-y-4">
                  <FormField
                    control={control}
                    name="ivr.enabled"
                    render={({ field }) => (
                      <FormItem className="flex items-center justify-between rounded-lg border p-3">
                        <div>
                          <FormLabel>Navigate phone menus</FormLabel>
                          <FormDescription>
                            When the assistant hears a menu (&ldquo;press 1 for
                            sales&rdquo;), it sends the keypad tones and keeps the
                            conversation going across the reconnect.
                          </FormDescription>
                        </div>
                        <FormControl>
                          <Switch
                            checked={field.value}
                            onCheckedChange={field.onChange}
                          />
                        </FormControl>
                      </FormItem>
                    )}
                  />

                  {ivrEnabled && (
                    <FormField
                      control={control}
                      name="ivr.navigationPrompt"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Navigation guidance (optional)</FormLabel>
                          <FormDescription>
                            The assistant already knows how to work menus: it
                            listens to the options offered and picks the one most
                            likely to reach a live human. Add specifics only if
                            you know the target&apos;s menu.
                          </FormDescription>
                          <FormControl>
                            <Textarea
                              rows={3}
                              placeholder="e.g. Press 3 for billing, then extension 1042."
                              {...field}
                              value={field.value ?? ""}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-3">
                  <SectionHeader
                    icon={PhoneOff}
                    title="End call"
                    description="Let the assistant hang up on its own once the conversation is done."
                    tone="fuchsia"
                  />
                </CardHeader>
                <CardContent className="space-y-4">
                  <FormField
                    control={control}
                    name="endCall.enabled"
                    render={({ field }) => (
                      <FormItem className="flex items-center justify-between rounded-lg border p-3">
                        <div>
                          <FormLabel>Allow the assistant to end the call</FormLabel>
                          <FormDescription>
                            Gives the assistant an end-call tool it can use when
                            the caller says goodbye or the task is complete.
                          </FormDescription>
                        </div>
                        <FormControl>
                          <Switch
                            checked={field.value}
                            onCheckedChange={field.onChange}
                          />
                        </FormControl>
                      </FormItem>
                    )}
                  />

                  {endCallEnabled && (
                    <div className="space-y-4">
                      <FormField
                        control={control}
                        name="endCall.instructions"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>When to end the call</FormLabel>
                            <FormDescription>
                              Describe when the assistant should hang up. Matched
                              by intent. Leave blank to only end on a clear
                              goodbye.
                            </FormDescription>
                            <FormControl>
                              <Textarea
                                rows={2}
                                placeholder="e.g. After confirming the appointment and answering any final questions."
                                {...field}
                                value={field.value ?? ""}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={control}
                        name="endCall.goodbyeMessage"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Goodbye message (optional)</FormLabel>
                            <FormDescription>
                              Spoken right before hanging up. Leave blank to end
                              without a scripted goodbye.
                            </FormDescription>
                            <FormControl>
                              <Textarea
                                rows={2}
                                placeholder="e.g. Thanks for your time — have a great day!"
                                {...field}
                                value={field.value ?? ""}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={control}
                        name="endCall.endCallPhrases"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>End-call phrases (optional)</FormLabel>
                            <FormDescription>
                              One phrase per line. The assistant ends the call when the
                              caller says any of these (or a close paraphrase).
                            </FormDescription>
                            <FormControl>
                              <Textarea
                                rows={3}
                                placeholder={"goodbye\nthat's all\nwe're done"}
                                value={(field.value ?? []).join("\n")}
                                onChange={(e) =>
                                  field.onChange(
                                    e.target.value.split("\n").map((s) => s.trim()).filter(Boolean),
                                  )
                                }
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {/* ── Advanced tab ──────────────────────────────────── */}
            {/* ── Tools tab ────────────────────────────────────── */}
            <TabsContent value="tools" className="mt-4 space-y-4">
              <Card>
                <CardHeader className="pb-3">
                  <SectionHeader
                    icon={Wrench}
                    title="Custom tools"
                    description="HTTP tools the assistant can call mid-conversation. Manage tools on the Tools page."
                    tone="sky"
                  />
                </CardHeader>
                <CardContent>
                  <FormField
                    control={control}
                    name="toolIds"
                    render={({ field }) => {
                      const selected: string[] = field.value ?? [];
                      const toggle = (id: string, on: boolean) =>
                        field.onChange(on ? [...selected, id] : selected.filter((x) => x !== id));
                      if (!userTools || userTools.length === 0) {
                        return (
                          <p className="text-sm text-muted-foreground">
                            You have no tools yet.{" "}
                            <Link href="/tools" className="text-primary underline underline-offset-2">
                              Create one
                            </Link>{" "}
                            to attach it here.
                          </p>
                        );
                      }
                      return (
                        <div className="space-y-2">
                          {userTools.map((t) => (
                            <label key={t.id}
                              className="flex items-start gap-3 rounded-lg border p-3 cursor-pointer">
                              <Checkbox
                                checked={selected.includes(t.id!)}
                                onCheckedChange={(c) => toggle(t.id!, Boolean(c))}
                              />
                              <div className="space-y-0.5">
                                <div className="text-sm font-medium">{t.name}{" "}
                                  <span className="text-xs font-normal text-muted-foreground">({t.method})</span>
                                </div>
                                {t.description && (
                                  <p className="text-xs text-muted-foreground">{t.description}</p>
                                )}
                              </div>
                            </label>
                          ))}
                        </div>
                      );
                    }}
                  />
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="analysis" className="mt-4 space-y-4">
              <Card>
                <CardHeader className="pb-3">
                  <SectionHeader
                    icon={ClipboardList}
                    title="End-of-call questions"
                    description="Questions the assistant answers about each call at the end — scored on this assistant's own model, for both inbound and outbound calls. Pick an output type per question. Results show on the call and campaign pages."
                    tone="violet"
                  />
                </CardHeader>
                <CardContent>
                  <FormField
                    control={control}
                    name="analysisQuestions"
                    render={({ field }) => (
                      <QuestionsEditor
                        rows={(field.value ?? []).map((q) => ({
                          id: q.id, text: q.text, type: q.type ?? "boolean",
                        }))}
                        onChange={field.onChange}
                      />
                    )}
                  />
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="advanced" className="mt-4 space-y-4">
              <Card>
                <CardHeader className="pb-3">
                  <SectionHeader
                    icon={Gauge}
                    title="Performance"
                    description="Trade GPU memory for lower first-call latency."
                    tone="fuchsia"
                  />
                </CardHeader>
                <CardContent>
                  <FormField
                    control={control}
                    name="prewarm"
                    render={({ field }) => (
                      <FormItem className="flex items-start justify-between gap-4 rounded-lg border p-3">
                        <div className="space-y-1">
                          <FormLabel>Use pre-warmed engines</FormLabel>
                          <FormDescription>
                            On: calls reuse this assistant&apos;s STT, TTS &amp;
                            LLM from the in-memory pool (warmed on save and at
                            server startup) — faster first response, but holds
                            GPU memory between calls. Off: engines are built
                            fresh for every call — nothing held between calls, at
                            the cost of load time on the first response.
                          </FormDescription>
                        </div>
                        <FormControl>
                          <Switch
                            checked={field.value}
                            onCheckedChange={field.onChange}
                          />
                        </FormControl>
                      </FormItem>
                    )}
                  />

                  <p className="mt-2 text-xs text-muted-foreground">
                    {prewarm ? (
                      <>
                        Calls will reuse a pre-warmed{" "}
                        <strong>{ttsEngineLabel}</strong> (TTS) +{" "}
                        <strong>{sttEngineLabel}</strong> (STT). Saving warms them now; a
                        toast confirms when ready.
                      </>
                    ) : (
                      <>
                        Calls will build <strong>{ttsEngineLabel}</strong> (TTS) +{" "}
                        <strong>{sttEngineLabel}</strong> (STT) fresh each time. No pool is
                        held in memory for this assistant.
                      </>
                    )}
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-3">
                  <SectionHeader
                    icon={SlidersHorizontal}
                    title="Speech detection"
                    description="How quickly the assistant decides the caller has finished speaking."
                    tone="fuchsia"
                  />
                </CardHeader>
                <CardContent>
                  <FormField
                    control={control}
                    name="vad.responsiveness"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Responsiveness</FormLabel>
                        <Select value={field.value ?? null} onValueChange={field.onChange}>
                          <FormControl>
                            <SelectTrigger className="w-full">
                              <SelectValue placeholder="Select responsiveness" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="snappy">Snappy — responds fastest</SelectItem>
                            <SelectItem value="balanced">Balanced — default</SelectItem>
                            <SelectItem value="patient">Patient — waits longer</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormDescription>
                          Snappy responds fastest (may cut off slow talkers); Patient waits
                          longer (fewer false cut-offs). Balanced matches the default.
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </form>
      </Form>

      <SaveBar
        isDirty={isDirty}
        isSaving={isSubmitting}
        onSave={handleSave}
      />
    </>
  );
}
