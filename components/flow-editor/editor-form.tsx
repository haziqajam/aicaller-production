"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useForm, useFieldArray, useWatch, type Resolver } from "react-hook-form";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import { Slider } from "@/components/ui/slider";
import { flowSchema, type Flow, type FlowNode } from "@/lib/api/schemas";
import { Flows, Tools, Voices, type Voice } from "@/lib/api/resources";
import type { Tool } from "@/lib/api/schemas";
import { toastApiError } from "@/lib/api/errors";
import { Catalog } from "@/lib/api/catalog";
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
import { SaveBar } from "@/components/assistant-editor/save-bar";
import { FlowCallDialog } from "@/components/flow-call-dialog";
import {
  PlusIcon,
  Trash2Icon,
  CopyIcon,
  CircleDotIcon,
  ArrowRightIcon,
  WorkflowIcon,
  PhoneOffIcon,
  MessageSquareTextIcon,
  FunctionSquareIcon,
  BrainCircuitIcon,
  SparklesIcon,
  ZapIcon,
  ServerIcon,
  WavesIcon,
  FlaskConicalIcon,
  LanguagesIcon,
  Volume2Icon,
  CpuIcon,
  EarIcon,
  MicIcon,
  GlobeIcon,
  GaugeIcon,
  PhoneForwardedIcon,
  type LucideIcon,
} from "lucide-react";

/* Icon + label maps — mirror the assistant editor so engines read identically
 * across both editors. */
const PROVIDER_ICON: Record<LlmProvider, LucideIcon> = {
  openai: SparklesIcon,
  groq: ZapIcon,
  ollama: ServerIcon,
  openrouter: GlobeIcon,
};
const STT_ICON: Record<string, LucideIcon> = {
  deepgram: WavesIcon,
  openai: SparklesIcon,
  asrtest: FlaskConicalIcon,
  whisper_local: LanguagesIcon,
  // sherpa-onnx engines (self-hosted ONNX, one fixed model each).
  "moonshine-base": EarIcon,
  "parakeet-v2": CpuIcon,
  "parakeet-v3": CpuIcon,
};
const TTS_ICON: Record<TtsEngine, LucideIcon> = {
  kokoro: Volume2Icon,
  piper_urdu: LanguagesIcon,
  vibevoice: Volume2Icon,
  deepgram: WavesIcon,
  neutts: Volume2Icon,
};

const STT_LABEL: Record<string, string> = {
  deepgram: "Deepgram",
  openai: "OpenAI Whisper",
  asrtest: "Urdu (Local)",
  whisper_local: "Multilingual (Local)",
  "moonshine-base": "Moonshine (Local)",
  "parakeet-v2": "Parakeet v2 (Local)",
  "parakeet-v3": "Parakeet v3 (Local)",
};
const TTS_LABEL: Record<string, string> = {
  kokoro: "English (Local)",   // keep in sync with the assistant editor + card-helpers
  piper_urdu: "Urdu (Piper)",
  vibevoice: "VibeVoice",
  deepgram: "Deepgram Aura",
  neutts: "NeuTTS Nano (Local)",
};

/* Small cloud vs self-hosted pill shown beside each engine/provider option
 * (mirrors the assistant editor). */
function TypeBadge({ type }: { type?: "cloud" | "self-hosted" }) {
  if (!type) return null;
  const self = type === "self-hosted";
  return (
    <span
      className={cn(
        "ml-auto rounded-sm border px-1 py-0.5 text-[9px] font-medium uppercase tracking-wide",
        self
          ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
          : "border-sky-500/30 bg-sky-500/10 text-sky-400"
      )}
    >
      {self ? "Self-hosted" : "Cloud"}
    </span>
  );
}

const NEW_NODE: FlowNode = {
  name: "",
  role_messages: [],
  task_messages: [{ role: "system", content: "" }],
  functions: [],
  pre_actions: [],
  post_actions: [],
  context_strategy: "append",
  respond_immediately: true,
};

/** End-call node template — the canonical pipecat-flows terminal node. */
const END_NODE: FlowNode = {
  ...NEW_NODE,
  name: "end_call",
  task_messages: [{
    role: "system",
    content: "Thank the caller warmly and say goodbye.",
  }],
  post_actions: [{ type: "end_conversation", text: "" }],
};

interface FlowEditorFormProps {
  flowId: string | undefined;
  defaultValues: Flow;
}

export function FlowEditorForm({ flowId, defaultValues }: FlowEditorFormProps) {
  const router = useRouter();
  const qc = useQueryClient();
  const isNew = !flowId;

  const form = useForm<Flow>({
    resolver: zodResolver(flowSchema) as Resolver<Flow>,
    defaultValues,
    mode: "onChange",
  });
  const { control, getValues, setValue } = form;

  const nodesArray = useFieldArray({ control, name: "nodes" });
  const nodes = useWatch({ control, name: "nodes" }) ?? [];
  const nodeNames = nodes.map((n) => n?.name ?? "");

  const [selected, setSelected] = React.useState(0);
  const [saving, setSaving] = React.useState(false);
  const selectedSafe = Math.min(selected, Math.max(0, nodesArray.fields.length - 1));

  // The owner's HTTP tools — used by http_tool function rows.
  const { data: tools } = useQuery<Tool[]>({ queryKey: ["tools"], queryFn: Tools.list });

  // ── Catalog-driven engine/model/voice options (mirrors the assistant editor;
  // the backend catalog is the single source of truth, static seeds are the
  // offline fallback). ─────────────────────────────────────────────────────
  const ivrEnabled = useWatch({ control, name: "ivr.enabled" }) ?? false;
  const llmProvider = useWatch({ control, name: "llm.provider" }) ?? "openai";
  const sttEngine = useWatch({ control, name: "stt.engine" }) ?? "deepgram";
  const ttsEngine = useWatch({ control, name: "tts.engine" }) ?? "kokoro";
  const ttsVoice = useWatch({ control, name: "tts.voice" }) ?? "";
  const sttModel = useWatch({ control, name: "stt.model" });

  const { data: rawCatalog } = useQuery({
    queryKey: ["voices"],
    queryFn: Voices.catalog,
    staleTime: 5 * 60 * 1000,
  });
  const runtimeCatalog: Record<string, string[]> | undefined =
    rawCatalog && typeof rawCatalog === "object" && !Array.isArray(rawCatalog)
      ? (rawCatalog as Record<string, string[]>)
      : undefined;

  const { data: catalog } = useQuery({
    queryKey: ["catalog"],
    queryFn: Catalog.get,
    staleTime: 5 * 60 * 1000,
  });
  const llmProviders = catalog?.llm;
  const sttEngines = catalog?.stt;
  const ttsEngines = catalog?.tts;

  // NeuTTS voices are per-owner rows, not a fixed catalog list — same treatment
  // as the assistant editor (flows share the backend's TTSConfig).
  const dynamicVoices = hasDynamicVoices(ttsEngines, ttsEngine);
  const { data: engineVoices, isPending: voicesPending } = useQuery({
    queryKey: ["voices", ttsEngine],
    queryFn: () => Voices.list(ttsEngine),
    enabled: dynamicVoices,
    staleTime: 30 * 1000,
  });

  // New flow: snap default engines to the first tier-ALLOWED catalog option so a
  // low-tier user isn't blocked (the hardcoded openai/deepgram defaults may be
  // above their tier, which the filtered catalog omits → 403 on save). Only for
  // a brand-new flow; never rewrite an existing saved config.
  React.useEffect(() => {
    if (!isNew || !catalog) return;
    const llm = catalog.llm ?? [];
    const stt = catalog.stt ?? [];
    const tts = catalog.tts ?? [];
    if (llm.length && !llm.some((p) => p.id === llmProvider)) {
      const p = llm[0];
      setValue("llm.provider", p.id as "openai" | "groq" | "ollama" | "openrouter", { shouldDirty: false });
      if (p.models?.[0]) setValue("llm.model", p.models[0].id, { shouldDirty: false });
    }
    if (stt.length && !stt.some((e) => e.id === sttEngine)) {
      setValue("stt.engine", stt[0].id as "openai" | "deepgram" | "asrtest" | "whisper_local",
        { shouldDirty: false });
    }
    if (tts.length && !tts.some((e) => e.id === ttsEngine)) {
      const t = tts[0];
      setValue("tts.engine", t.id as TtsEngine,
        { shouldDirty: false });
      if (t.voices?.[0]) setValue("tts.voice", t.voices[0], { shouldDirty: false });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isNew, catalog]);

  // Live model overlay for providers flagged `live` (groq / ollama).
  const providerInfo = llmProviders?.find((p) => p.id === llmProvider);
  const { data: liveModels } = useQuery({
    queryKey: ["provider-models", llmProvider],
    queryFn: () => Catalog.providerModels(llmProvider),
    enabled: !!providerInfo?.live,
    staleTime: 60 * 60 * 1000,
  });

  const llmProviderOptions: { id: string; label: string; type?: "cloud" | "self-hosted" }[] =
    llmProviders?.map((p) => ({ id: p.id, label: p.label, type: p.type })) ??
    (Object.keys(PROVIDER_LABELS) as LlmProvider[]).map((id) => ({
      id,
      label: PROVIDER_LABELS[id],
    }));
  const sttEngineOptions: { id: string; label: string; type?: "cloud" | "self-hosted" }[] =
    sttEngines?.map((e) => ({ id: e.id, label: e.label, type: e.type })) ??
    Object.keys(STT_LABEL).map((id) => ({ id, label: STT_LABEL[id] }));
  const ttsEngineOptions: { id: string; label: string; type?: "cloud" | "self-hosted" }[] =
    ttsEngines?.map((e) => ({ id: e.id, label: e.label, type: e.type })) ??
    (Object.keys(TTS_LABEL) as TtsEngine[]).map((id) => ({ id, label: TTS_LABEL[id] }));

  const sttEngineInfo = sttEngines?.find((e) => e.id === sttEngine);
  const sttLanguages = sttEngineInfo?.languages ?? STT_LANGUAGES.map((l) => l.value);
  const whisperSizes = sttEngineInfo?.modelSizes;
  const isWhisperLocal = sttEngine === "whisper_local";
  const ttsEngineLabel =
    ttsEngineOptions.find((e) => e.id === ttsEngine)?.label ??
    TTS_LABEL[ttsEngine as TtsEngine] ??
    ttsEngine;

  const voiceOptions = voiceOptionsForEngine(ttsEngines, ttsEngine, {
    voices: engineVoices,
    runtimeCatalog,
  });
  const voiceListReady = !dynamicVoices || !voicesPending;
  const voiceIsValid = voiceOptions.some((o) => o.value === ttsVoice);
  const voiceItems = Object.fromEntries(
    voiceOptions.map((o) => [o.value, o.label])
  );
  const availableModels = modelsFromCatalog(
    llmProviders, llmProvider, liveModels?.models);

  // Base UI Select shows the raw `value` in the CLOSED trigger unless given an
  // `items` value→label map (display only; the stored value stays the id).
  const providerItems = Object.fromEntries(
    llmProviderOptions.map((o) => [o.id, o.label]));
  const modelItems = Object.fromEntries(
    availableModels.map((m) => [m.value, m.label]));
  const sttEngineItems = Object.fromEntries(
    sttEngineOptions.map((o) => [o.id, o.label]));
  const ttsEngineItems = Object.fromEntries(
    ttsEngineOptions.map((o) => [o.id, o.label]));
  const languageItems = Object.fromEntries(
    sttLanguages.map((code) => [code, languageLabel(code)]));

  /** Snap the model to a valid choice for a newly-picked provider (driven by
   *  onValueChange, not an effect — an effect can't tell a real switch from
   *  form hydration and would clobber a live groq/ollama model). */
  const onProviderChange = React.useCallback(
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
  const onSttEngineChange = React.useCallback(
    (engine: string | null) => {
      if (!engine) return;
      setValue("stt.engine", engine as Flow["stt"]["engine"], {
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
  const onTtsEngineChange = React.useCallback(
    (engine: TtsEngine | null) => {
      if (!engine) return;
      setValue("tts.engine", engine, { shouldDirty: true });
      const options = voiceOptionsForEngine(ttsEngines, engine, {
        voices: qc.getQueryData<Voice[]>(["voices", engine]),
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
    [setValue, getValues, ttsEngines, runtimeCatalog, qc]
  );

  // Repair the voice once a dynamic engine's rows arrive (the list is empty
  // until GET /voices resolves, so onTtsEngineChange can't do it synchronously).
  React.useEffect(() => {
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
  React.useEffect(() => {
    if (isWhisperLocal && whisperSizes && whisperSizes.length > 0) {
      if (!sttModel || !whisperSizes.includes(sttModel)) {
        setValue("stt.model", whisperSizes[0], { shouldDirty: true });
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sttEngine, whisperSizes]);

  /** Rename a node AND retarget every reference (initial_node, transition_to)
   *  so a rename never silently breaks the graph. */
  const renameNode = React.useCallback((index: number, next: string) => {
    const prev = getValues(`nodes.${index}.name`);
    setValue(`nodes.${index}.name`, next, { shouldDirty: true, shouldValidate: true });
    if (!prev || prev === next) return;
    if (getValues("initial_node") === prev) {
      setValue("initial_node", next, { shouldDirty: true });
    }
    getValues("nodes").forEach((node, ni) => {
      (node.functions ?? []).forEach((fn, fi) => {
        if (fn.transition_to === prev) {
          setValue(`nodes.${ni}.functions.${fi}.transition_to`, next, { shouldDirty: true });
        }
      });
    });
  }, [getValues, setValue]);

  function addNode(template: FlowNode) {
    const base = template.name || "node";
    let name = base;
    for (let i = 2; nodeNames.includes(name); i++) name = `${base}_${i}`;
    nodesArray.append({ ...template, name });
    setSelected(nodesArray.fields.length); // the appended index
  }

  function duplicateNode(index: number) {
    const src = getValues(`nodes.${index}`);
    let name = `${src.name}_copy`;
    for (let i = 2; nodeNames.includes(name); i++) name = `${src.name}_copy_${i}`;
    nodesArray.insert(index + 1, { ...structuredClone(src), name });
    setSelected(index + 1);
  }

  function removeNode(index: number) {
    if (nodesArray.fields.length <= 1) {
      toast.error("A flow needs at least one node.");
      return;
    }
    nodesArray.remove(index);
    setSelected(Math.max(0, index - 1));
  }

  async function saveData(values: Flow) {
    setSaving(true);
    try {
      if (isNew) {
        const res = await Flows.create(values);
        await qc.invalidateQueries({ queryKey: ["flows"] });
        toast.success(`Created "${values.name}"`);
        router.replace(`/flows/${res.id}`);
      } else {
        await Flows.update(flowId as string, values);
        await qc.invalidateQueries({ queryKey: ["flows"] });
        form.reset(values); // clear dirty state, keep edits
        toast.success("Flow saved");
      }
    } catch (err) {
      toastApiError(err, "Couldn't save flow");
    } finally {
      setSaving(false);
    }
  }

  /** On invalid submit: jump to the first node that has errors. */
  function onInvalid(errors: Record<string, unknown>) {
    const nodeErrors = errors.nodes as unknown[] | undefined;
    if (Array.isArray(nodeErrors)) {
      const idx = nodeErrors.findIndex(Boolean);
      if (idx >= 0) setSelected(idx);
    }
    toast.error("Fix the highlighted fields before saving.");
  }

  const submit = form.handleSubmit(saveData, onInvalid);

  return (
    <Form {...form}>
      <form onSubmit={(e) => e.preventDefault()} className="space-y-4 pb-24">
        {/* ── Identity ─────────────────────────────────────────── */}
        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <div className="flex items-center gap-2 text-sm font-medium">
              <WorkflowIcon className="size-4 text-primary" aria-hidden />
              Flow
            </div>
            {!isNew && <FlowCallDialog defaultFlowId={flowId} />}
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <FormField
              control={control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Name</FormLabel>
                  <FormControl>
                    <Input placeholder="e.g. Appointment booking" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={control}
              name="initial_node"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Starting node</FormLabel>
                  <Select
                    value={field.value || null}
                    onValueChange={(v) => field.onChange(v ?? "")}
                  >
                    <FormControl>
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Pick the first node…" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {nodeNames.filter(Boolean).map((n) => (
                        <SelectItem key={n} value={n}>
                          <CircleDotIcon className="size-3.5 text-primary" />
                          {n}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={control}
              name="description"
              render={({ field }) => (
                <FormItem className="sm:col-span-2">
                  <FormLabel>Description <span className="font-normal text-muted-foreground">(optional)</span></FormLabel>
                  <FormControl>
                    <Textarea rows={2} placeholder="What this flow does…" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={control}
              name="allowInterruptions"
              render={({ field }) => (
                <FormItem className="flex flex-row items-center justify-between rounded-lg border border-border p-3 sm:col-span-2">
                  <div className="space-y-0.5 pr-4">
                    <FormLabel>Allow barge-in</FormLabel>
                    <FormDescription>
                      The caller can interrupt the bot mid-speech.
                    </FormDescription>
                  </div>
                  <FormControl>
                    <Switch checked={field.value ?? false} onCheckedChange={field.onChange} />
                  </FormControl>
                </FormItem>
              )}
            />
          </CardContent>
        </Card>

        {/* ── Voice & model — catalog-driven, mirrors the assistant editor ── */}
        <Card>
          <CardHeader className="flex-row items-center gap-2 space-y-0 text-sm font-medium">
            <BrainCircuitIcon className="size-4 text-primary" aria-hidden />
            Voice &amp; model
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <FormField
              control={control}
              name="llm.provider"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>LLM provider</FormLabel>
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
                        const Icon = PROVIDER_ICON[p.id as LlmProvider] ?? ServerIcon;
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
                          <CpuIcon className="size-3.5 text-muted-foreground" />
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
                      {PROVIDER_LABELS[llmProvider as LlmProvider] ?? llmProvider}
                    </span>{" "}
                    are shown.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={control}
              name="stt.engine"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Transcription</FormLabel>
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
                        const Icon = STT_ICON[e.id] ?? MicIcon;
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
                          <GlobeIcon className="size-3.5 text-muted-foreground" />
                          {languageLabel(code)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
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
                            <CpuIcon className="size-3.5 text-muted-foreground" />
                            {size}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormDescription>
                      Bigger models are more accurate but slower.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}
            <FormField
              control={control}
              name="tts.engine"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Voice engine</FormLabel>
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
                        const Icon = TTS_ICON[e.id as TtsEngine] ?? Volume2Icon;
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
                    Switching engines resets the voice selection.
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
                          <MicIcon className="size-3.5 text-muted-foreground" />
                          {v.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {/* Explain invalid combo — never silently allow it. Suppressed
                      while a dynamic list loads, or it flags every saved voice. */}
                  {voiceListReady && !voiceIsValid && ttsVoice && (
                    <p className="mt-1 text-xs text-warning">
                      Voice &ldquo;{ttsVoice}&rdquo; is not compatible with{" "}
                      <strong className="font-medium">{ttsEngineLabel}</strong>.
                      Select a voice from the list above.
                    </p>
                  )}
                  <FormDescription>
                    Voices available for{" "}
                    <span className="tabular rounded-sm border border-border bg-muted/60 px-1 py-0.5 text-[10px] font-medium text-foreground/80">
                      {ttsEngineLabel}
                    </span>
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            {/* Voice speed — honored by kokoro & piper_urdu; deepgram (Aura),
                vibevoice, and neutts have no rate param, so hide it there. */}
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
                      How fast the bot speaks. 1.0× is the default rate.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}
          </CardContent>
        </Card>

        {/* ── Behavior — barge-in is on the Flow card; these tune listening ── */}
        <Card>
          <CardHeader className="flex-row items-center gap-2 space-y-0 text-sm font-medium">
            <GaugeIcon className="size-4 text-primary" aria-hidden />
            Behavior
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-3">
            <FormField
              control={control}
              name="vad.responsiveness"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Responsiveness</FormLabel>
                  <Select
                    value={field.value || null}
                    onValueChange={(v) => field.onChange(v ?? "balanced")}
                  >
                    <FormControl>
                      <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="snappy">Snappy — replies fast</SelectItem>
                      <SelectItem value="balanced">Balanced</SelectItem>
                      <SelectItem value="patient">Patient — waits longer</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormDescription>How eagerly the bot decides the caller finished speaking.</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={control}
              name="idle.timeout"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Silence nudge after (s)</FormLabel>
                  <FormControl>
                    <Input
                      type="number" min={1} max={120}
                      value={field.value ?? 5}
                      onChange={(e) => field.onChange(Number(e.target.value))}
                    />
                  </FormControl>
                  <FormDescription>Seconds of caller silence before a check-in.</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={control}
              name="idle.maxRetries"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Nudges before hang-up</FormLabel>
                  <FormControl>
                    <Input
                      type="number" min={0} max={10}
                      value={field.value ?? 2}
                      onChange={(e) => field.onChange(Number(e.target.value))}
                    />
                  </FormControl>
                  <FormDescription>After this many unanswered check-ins the call ends.</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
          </CardContent>
        </Card>

        {/* ── Call features — transfer / voicemail / IVR (assistant parity) ── */}
        <Card>
          <CardHeader className="flex-row items-center gap-2 space-y-0 text-sm font-medium">
            <PhoneForwardedIcon className="size-4 text-primary" aria-hidden />
            Call features
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Transfer target — consumed by node-level "Transfer to a human"
                functions (add one to each node where a hand-off is allowed). */}
            <div className="space-y-3 rounded-lg border border-border p-3">
              <div>
                <p className="text-sm font-medium">Transfer to a human</p>
                <p className="text-xs text-muted-foreground">
                  This only stores <em>where</em> transfers go — it does NOT
                  enable them anywhere. Transfers happen only in nodes where you
                  explicitly add a{" "}
                  <span className="font-medium">Transfer to a human</span>{" "}
                  function; every other node cannot hand off. (Real redirect on
                  phone calls, simulated in browser tests.)
                </p>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <FormField
                  control={control}
                  name="transfer.targets.0.number"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs">Agent number (E.164)</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="+14155551234"
                          className="font-mono text-xs"
                          value={field.value ?? ""}
                          onChange={(e) => {
                            const v = e.target.value;
                            // Keep targets a 0/1-length array like assistants.
                            setValue(
                              "transfer.targets",
                              v.trim() ? [{ number: v, whisperTemplate: "" }] : [],
                              { shouldDirty: true, shouldValidate: true },
                            );
                          }}
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
                      <FormLabel className="text-xs">Announcement</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="Please hold while I connect you."
                          {...field}
                        />
                      </FormControl>
                      <FormDescription>Spoken to the caller right before the hand-off.</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

            </div>

            {/* Voicemail detection — outbound phone calls only. */}
            <div className="space-y-3 rounded-lg border border-border p-3">
              <FormField
                control={control}
                name="voicemail.enabled"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-center justify-between">
                    <div className="space-y-0.5 pr-4">
                      <FormLabel>Voicemail detection</FormLabel>
                      <FormDescription>
                        Detect answering machines and phone menus. On voicemail the call ends and is
                        recorded as &ldquo;voicemail&rdquo;; menus are navigated automatically to reach a human.
                      </FormDescription>
                    </div>
                    <FormControl>
                      <Switch checked={field.value ?? false} onCheckedChange={field.onChange} />
                    </FormControl>
                  </FormItem>
                )}
              />
            </div>

            {/* IVR navigation — phone calls only. */}
            <div className="space-y-3 rounded-lg border border-border p-3">
              <FormField
                control={control}
                name="ivr.enabled"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-center justify-between">
                    <div className="space-y-0.5 pr-4">
                      <FormLabel>Phone menu navigation (IVR)</FormLabel>
                      <FormDescription>
                        Lets the bot press keypad digits to get through automated
                        menus — available in every node. Phone calls only.
                      </FormDescription>
                    </div>
                    <FormControl>
                      <Switch checked={field.value ?? false} onCheckedChange={field.onChange} />
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
                      <FormLabel className="text-xs">Navigation guidance (optional — menus are handled automatically)</FormLabel>
                      <FormControl>
                        <Textarea
                          rows={2}
                          placeholder='e.g. "Press 3 for billing, then extension 1042."'
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}
            </div>
          </CardContent>
        </Card>

        {/* ── Conversation graph ───────────────────────────────── */}
        <div className="grid gap-4 lg:grid-cols-[260px_1fr]">
          {/* Node list */}
          <Card className="h-fit">
            <CardHeader className="flex-row items-center justify-between space-y-0 text-sm font-medium">
              <span className="flex items-center gap-2">
                <WorkflowIcon className="size-4 text-primary" aria-hidden />
                Nodes
              </span>
              <span className="text-[10px] text-muted-foreground">{nodesArray.fields.length}</span>
            </CardHeader>
            <CardContent className="space-y-1.5">
              {nodesArray.fields.map((f, i) => {
                const name = nodeNames[i] || "(unnamed)";
                const isInitial = getValues("initial_node") === nodeNames[i];
                const endsCall = (nodes[i]?.post_actions ?? [])
                  .some((a) => a?.type === "end_conversation");
                const hasError = !!form.formState.errors.nodes?.[i];
                return (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => setSelected(i)}
                    className={cn(
                      "flex w-full items-center gap-2 rounded-md border px-2.5 py-2 text-left text-xs font-medium transition-colors",
                      i === selectedSafe
                        ? "border-primary bg-primary/10 text-foreground"
                        : "border-border bg-background text-muted-foreground hover:bg-muted",
                      hasError && "border-destructive/60"
                    )}
                  >
                    {isInitial ? (
                      <CircleDotIcon className="size-3.5 shrink-0 text-primary" aria-hidden />
                    ) : endsCall ? (
                      <PhoneOffIcon className="size-3.5 shrink-0 text-destructive/70" aria-hidden />
                    ) : (
                      <ArrowRightIcon className="size-3.5 shrink-0" aria-hidden />
                    )}
                    <span className="min-w-0 flex-1 truncate">{name}</span>
                    {hasError && <span className="size-1.5 shrink-0 rounded-full bg-destructive" aria-hidden />}
                  </button>
                );
              })}
              <div className="flex flex-col gap-1.5 pt-2">
                <Button type="button" variant="outline" size="sm" onClick={() => addNode(NEW_NODE)}>
                  <PlusIcon className="size-3.5" aria-hidden />
                  Add node
                </Button>
                <Button type="button" variant="outline" size="sm" onClick={() => addNode(END_NODE)}>
                  <PhoneOffIcon className="size-3.5" aria-hidden />
                  Add end-call node
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Selected node panel — keyed remount so per-node field arrays rebind. */}
          {nodesArray.fields.length > 0 && (
            <NodePanel
              key={nodesArray.fields[selectedSafe]?.id ?? selectedSafe}
              form={form}
              index={selectedSafe}
              nodeNames={nodeNames}
              tools={tools ?? []}
              onRename={renameNode}
              onDuplicate={() => duplicateNode(selectedSafe)}
              onRemove={() => removeNode(selectedSafe)}
            />
          )}
        </div>
      </form>

      <SaveBar
        isDirty={form.formState.isDirty || isNew}
        isSaving={saving}
        onSave={submit}
      />
    </Form>
  );
}

/* ──────────────────────────────────────────────────────────────────────────
 * Per-node editing panel
 * ──────────────────────────────────────────────────────────────────────── */
function NodePanel({
  form,
  index,
  nodeNames,
  tools,
  onRename,
  onDuplicate,
  onRemove,
}: {
  form: ReturnType<typeof useForm<Flow>>;
  index: number;
  nodeNames: string[];
  tools: Tool[];
  onRename: (index: number, next: string) => void;
  onDuplicate: () => void;
  onRemove: () => void;
}) {
  const { control, getValues, setValue } = form;
  const functionsArray = useFieldArray({ control, name: `nodes.${index}.functions` });

  // Persona = role_messages[0]. Stored as a 0/1-length array.
  const persona = useWatch({ control, name: `nodes.${index}.role_messages` }) ?? [];
  const postActions = useWatch({ control, name: `nodes.${index}.post_actions` }) ?? [];
  const preActions = useWatch({ control, name: `nodes.${index}.pre_actions` }) ?? [];
  const respondImmediately =
    useWatch({ control, name: `nodes.${index}.respond_immediately` }) ?? true;
  const endsCall = postActions.some((a) => a?.type === "end_conversation");
  const preSay = preActions.find((a) => a?.type === "tts_say");
  const goodbye = postActions.find((a) => a?.type === "tts_say");

  function setPersona(text: string) {
    setValue(
      `nodes.${index}.role_messages`,
      text.trim() ? [{ role: "system" as const, content: text }] : [],
      { shouldDirty: true },
    );
  }

  function setPreSay(text: string) {
    setValue(
      `nodes.${index}.pre_actions`,
      text.trim() ? [{ type: "tts_say" as const, text }] : [],
      { shouldDirty: true },
    );
  }

  function setEndsCall(on: boolean) {
    const say = goodbye?.text?.trim();
    setValue(
      `nodes.${index}.post_actions`,
      on
        ? [...(say ? [{ type: "tts_say" as const, text: say }] : []),
           { type: "end_conversation" as const, text: "" }]
        : [],
      { shouldDirty: true },
    );
  }

  function setGoodbye(text: string) {
    setValue(
      `nodes.${index}.post_actions`,
      [...(text.trim() ? [{ type: "tts_say" as const, text }] : []),
       { type: "end_conversation" as const, text: "" }],
      { shouldDirty: true },
    );
  }

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <span className="flex items-center gap-2 text-sm font-medium">
          <MessageSquareTextIcon className="size-4 text-primary" aria-hidden />
          Node
        </span>
        <div className="flex items-center gap-1.5">
          <Button type="button" variant="ghost" size="sm" onClick={onDuplicate}>
            <CopyIcon className="size-3.5" aria-hidden />
            Duplicate
          </Button>
          <Button type="button" variant="ghost" size="sm" className="text-destructive" onClick={onRemove}>
            <Trash2Icon className="size-3.5" aria-hidden />
            Remove
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField
            control={control}
            name={`nodes.${index}.name`}
            render={({ field }) => (
              <FormItem>
                <FormLabel>Node name</FormLabel>
                <FormControl>
                  <Input
                    {...field}
                    onChange={(e) => onRename(index, e.target.value)}
                    placeholder="e.g. collect_details"
                  />
                </FormControl>
                <FormDescription>Renaming updates every transition pointing here.</FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={control}
            name={`nodes.${index}.context_strategy`}
            render={({ field }) => (
              <FormItem>
                <FormLabel>Context on entry</FormLabel>
                <Select
                  value={field.value || null}
                  onValueChange={(v) => field.onChange(v ?? "append")}
                >
                  <FormControl>
                    <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value="append">Keep conversation history</SelectItem>
                    <SelectItem value="reset">Start fresh here</SelectItem>
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        {/* Persona (role message) */}
        <FormItem>
          <FormLabel>
            Persona <span className="font-normal text-muted-foreground">(optional — set it on the starting node)</span>
          </FormLabel>
          <FormControl>
            <Textarea
              rows={2}
              value={persona[0]?.content ?? ""}
              onChange={(e) => setPersona(e.target.value)}
              placeholder="e.g. You are a friendly booking agent for Acme Dental."
            />
          </FormControl>
          <FormDescription>
            Who the bot is. Carries forward across nodes; later nodes may override.
          </FormDescription>
        </FormItem>

        {/* Task message (the node's objective) */}
        <FormField
          control={control}
          name={`nodes.${index}.task_messages.0.content`}
          render={({ field }) => (
            <FormItem>
              <FormLabel>Task</FormLabel>
              <FormControl>
                <Textarea
                  rows={4}
                  {...field}
                  placeholder="What should the bot accomplish in this node? e.g. Ask for the caller's full name, then call save_name."
                />
              </FormControl>
              <FormDescription>
                The node&apos;s objective. Tell the bot when to call each function below.
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={control}
          name={`nodes.${index}.respond_immediately`}
          render={({ field }) => (
            <FormItem className="flex flex-row items-center justify-between rounded-lg border border-border p-3">
              <div className="space-y-0.5 pr-4">
                <FormLabel>Speak on entry</FormLabel>
                <FormDescription>
                  On the starting node this is the greeting: on = the bot speaks
                  first, off = it waits for the caller.
                </FormDescription>
              </div>
              <FormControl>
                <Switch checked={field.value ?? false} onCheckedChange={field.onChange} />
              </FormControl>
            </FormItem>
          )}
        />

        {/* Pre-action: spoken line while entering (before the LLM responds). */}
        <FormItem>
          <FormLabel>
            Say while entering <span className="font-normal text-muted-foreground">(optional)</span>
          </FormLabel>
          <FormControl>
            <Input
              value={preSay?.text ?? ""}
              onChange={(e) => setPreSay(e.target.value)}
              placeholder='e.g. "Let me pull that up…"'
            />
          </FormControl>
          <FormDescription>
            Spoken verbatim the moment the conversation enters this node —
            BEFORE the AI&apos;s own reply. For a fixed scripted greeting, put it
            here and turn off &ldquo;Speak on entry&rdquo; so the AI waits for
            the caller instead of greeting a second time.
          </FormDescription>
          {/* Double-greeting guard: with BOTH a scripted line and speak-on-entry,
              the bot says the line and then immediately generates an LLM turn —
              if the Task also describes the greeting, the caller hears the same
              intro twice back to back. */}
          {(preSay?.text ?? "").trim() && respondImmediately && (
            <p className="mt-1 rounded-md border border-amber-500/25 bg-amber-500/10 px-3 py-2 text-xs text-amber-500">
              This node will speak this line <strong>and then</strong> the AI
              will immediately generate its own response from the Task — the
              caller may hear two greetings in a row. Either turn off
              &ldquo;Speak on entry&rdquo; (the AI then waits for the caller
              after this line), or remove this line and let the Task drive the
              greeting.
            </p>
          )}
        </FormItem>

        {/* Functions */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <p className="flex items-center gap-1.5 text-sm font-medium">
              <FunctionSquareIcon className="size-4 text-primary" aria-hidden />
              Functions
            </p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() =>
                functionsArray.append({
                  name: "", description: "", kind: "transition",
                  parameters: [], transition_to: null, toolId: null, stateKey: null,
                })
              }
            >
              <PlusIcon className="size-3.5" aria-hidden />
              Add function
            </Button>
          </div>
          {functionsArray.fields.length === 0 && (
            <p className="rounded-md border border-dashed border-border px-3 py-2.5 text-xs text-muted-foreground">
              No functions — the conversation stays in this node until the call
              ends. Add a <span className="font-medium">transition</span> to move
              to another node, a <span className="font-medium">collect</span> to
              capture details into flow state, or an{" "}
              <span className="font-medium">HTTP tool</span> call.
            </p>
          )}
          {functionsArray.fields.map((f, fi) => (
            <FunctionRow
              key={f.id}
              form={form}
              nodeIndex={index}
              fnIndex={fi}
              nodeNames={nodeNames}
              tools={tools}
              onRemove={() => functionsArray.remove(fi)}
            />
          ))}
        </div>

        {/* End-call post action */}
        <div className="space-y-3 rounded-lg border border-border p-3">
          <div className="flex flex-row items-center justify-between">
            <div className="space-y-0.5 pr-4">
              <p className="text-sm font-medium">End the call after this node</p>
              <p className="text-xs text-muted-foreground">
                Once the bot finishes its response here, hang up gracefully.
              </p>
            </div>
            <Switch checked={endsCall} onCheckedChange={setEndsCall} />
          </div>
          {endsCall && (
            <Input
              value={goodbye?.text ?? ""}
              onChange={(e) => setGoodbye(e.target.value)}
              placeholder='Optional goodbye line, e.g. "Thanks for calling!"'
            />
          )}
        </div>
      </CardContent>
    </Card>
  );
}

/* ──────────────────────────────────────────────────────────────────────────
 * One function row (transition / collect / http_tool)
 * ──────────────────────────────────────────────────────────────────────── */
function FunctionRow({
  form,
  nodeIndex,
  fnIndex,
  nodeNames,
  tools,
  onRemove,
}: {
  form: ReturnType<typeof useForm<Flow>>;
  nodeIndex: number;
  fnIndex: number;
  nodeNames: string[];
  tools: Tool[];
  onRemove: () => void;
}) {
  const { control, setValue } = form;
  const base = `nodes.${nodeIndex}.functions.${fnIndex}` as const;
  const kind = useWatch({ control, name: `${base}.kind` }) ?? "transition";
  const paramsArray = useFieldArray({ control, name: `${base}.parameters` });

  return (
    <div className="space-y-3 rounded-lg border border-border bg-muted/20 p-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <FormField
          control={control}
          name={`${base}.kind`}
          render={({ field }) => (
            <FormItem>
              <FormLabel className="text-xs">What it does</FormLabel>
              <Select
                value={field.value || null}
                onValueChange={(v) => {
                  field.onChange(v ?? "transition");
                  if (v !== "http_tool") setValue(`${base}.toolId`, null, { shouldDirty: true });
                  if (v !== "collect") setValue(`${base}.stateKey`, null, { shouldDirty: true });
                  if (v === "transfer") {
                    // Transfers take no LLM arguments; give the function a
                    // sensible default name if it's still blank.
                    setValue(`${base}.parameters`, [], { shouldDirty: true });
                    const cur = form.getValues(`${base}.name`);
                    if (!cur) setValue(`${base}.name`, "transfer_call",
                                       { shouldDirty: true, shouldValidate: true });
                  }
                }}
              >
                <FormControl>
                  <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                </FormControl>
                <SelectContent>
                  <SelectItem value="transition">Move to another node</SelectItem>
                  <SelectItem value="collect">Collect info into flow state</SelectItem>
                  <SelectItem value="http_tool">Call an HTTP tool</SelectItem>
                  <SelectItem value="transfer">Transfer to a human</SelectItem>
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={control}
          name={`${base}.name`}
          render={({ field }) => (
            <FormItem>
              <FormLabel className="text-xs">Function name</FormLabel>
              <FormControl>
                <Input className="font-mono text-xs" placeholder="e.g. save_name" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
      </div>

      <FormField
        control={control}
        name={`${base}.description`}
        render={({ field }) => (
          <FormItem>
            <FormLabel className="text-xs">When should the model call it?</FormLabel>
            <FormControl>
              <Input placeholder="e.g. Once the caller has given their full name" {...field} />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />

      {kind === "transfer" && (
        <p className="rounded-md border border-dashed border-border px-3 py-2 text-xs text-muted-foreground">
          Hands the caller to a human using the number and announcement from{" "}
          <span className="font-medium">Call features → Transfer to a human</span>.
          Real redirect on phone calls; simulated (announcement only) in browser
          tests. Use the description above to tell the model WHEN to transfer.
        </p>
      )}

      {kind === "http_tool" && (
        <FormField
          control={control}
          name={`${base}.toolId`}
          render={({ field }) => (
            <FormItem>
              <FormLabel className="text-xs">HTTP tool</FormLabel>
              <Select
                value={field.value || null}
                onValueChange={(v) => {
                  field.onChange(v ?? null);
                  // Mirror the tool's parameters so the LLM schema matches what
                  // the request builder expects.
                  const tool = tools.find((t) => t.id === v);
                  if (tool) {
                    setValue(`${base}.parameters`, tool.parameters ?? [], { shouldDirty: true });
                    setValue(`${base}.name`, tool.name, { shouldDirty: true, shouldValidate: true });
                  }
                }}
              >
                <FormControl>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Pick one of your tools…" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {tools.map((t) => (
                    <SelectItem key={t.id} value={t.id ?? ""}>{t.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />
      )}

      {kind === "collect" && (
        <div className="space-y-2">
          <FormField
            control={control}
            name={`${base}.stateKey`}
            render={({ field }) => (
              <FormItem>
                <FormLabel className="text-xs">
                  State bucket <span className="font-normal text-muted-foreground">(optional — defaults to the function name)</span>
                </FormLabel>
                <FormControl>
                  <Input
                    className="font-mono text-xs"
                    placeholder="e.g. customer"
                    value={field.value ?? ""}
                    onChange={(e) => field.onChange(e.target.value || null)}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <p className="text-xs font-medium text-muted-foreground">Fields to collect</p>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() =>
                  paramsArray.append({
                    name: "", type: "string", description: "",
                    required: true, location: "query",
                  })
                }
              >
                <PlusIcon className="size-3 " aria-hidden />
                Add field
              </Button>
            </div>
            {paramsArray.fields.map((p, pi) => (
              <div key={p.id} className="flex items-end gap-2">
                <FormField
                  control={control}
                  name={`${base}.parameters.${pi}.name`}
                  render={({ field }) => (
                    <FormItem className="flex-1">
                      <FormControl>
                        <Input className="font-mono text-xs" placeholder="field name" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={control}
                  name={`${base}.parameters.${pi}.type`}
                  render={({ field }) => (
                    <FormItem className="w-28">
                      <Select
                        value={field.value || null}
                        onValueChange={(v) => field.onChange(v ?? "string")}
                      >
                        <FormControl>
                          <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="string">Text</SelectItem>
                          <SelectItem value="number">Number</SelectItem>
                          <SelectItem value="boolean">Yes / no</SelectItem>
                        </SelectContent>
                      </Select>
                    </FormItem>
                  )}
                />
                <FormField
                  control={control}
                  name={`${base}.parameters.${pi}.required`}
                  render={({ field }) => (
                    <FormItem className="flex items-center gap-1.5 pb-2">
                      <FormControl>
                        <Checkbox checked={field.value ?? false} onCheckedChange={field.onChange} />
                      </FormControl>
                      <FormLabel className="text-[10px] font-normal text-muted-foreground">req</FormLabel>
                    </FormItem>
                  )}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Remove field"
                  onClick={() => paramsArray.remove(pi)}
                >
                  <Trash2Icon className="size-3.5 text-muted-foreground" />
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="flex items-end justify-between gap-3">
        <FormField
          control={control}
          name={`${base}.transition_to`}
          render={({ field }) => (
            <FormItem className="flex-1">
              <FormLabel className="text-xs">
                Then go to{" "}
                {kind !== "transition" && (
                  <span className="font-normal text-muted-foreground">(optional)</span>
                )}
              </FormLabel>
              {/* "__stay__" sentinel: Base UI items need a non-empty value; the
                  form stores null for "no transition". */}
              <Select
                value={field.value || (kind !== "transition" ? "__stay__" : null)}
                onValueChange={(v) => field.onChange(v === "__stay__" ? null : (v ?? null))}
              >
                <FormControl>
                  <SelectTrigger className="w-full">
                    <ArrowRightIcon className="size-3.5 text-muted-foreground" aria-hidden />
                    <SelectValue placeholder="Pick the target node…" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {kind !== "transition" && (
                    <SelectItem value="__stay__">Stay in this node</SelectItem>
                  )}
                  {nodeNames.filter(Boolean).map((n) => (
                    <SelectItem key={n} value={n}>{n}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="text-destructive"
          onClick={onRemove}
        >
          <Trash2Icon className="size-3.5" aria-hidden />
          Remove
        </Button>
      </div>
    </div>
  );
}
