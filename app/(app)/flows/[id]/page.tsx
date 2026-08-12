"use client";

import { use } from "react";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { Flows } from "@/lib/api/resources";
import { parseApiError } from "@/lib/api/errors";
import { type Flow, DEFAULT_ACCENT } from "@/lib/api/schemas";
import { FlowEditorForm } from "@/components/flow-editor/editor-form";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowLeftIcon, WorkflowIcon, SparklesIcon } from "lucide-react";

const NEW_DEFAULTS: Flow = {
  name: "",
  description: "",
  initial_node: "greeting",
  nodes: [
    {
      name: "greeting",
      role_messages: [{ role: "system", content: "" }],
      task_messages: [{ role: "system", content: "" }],
      functions: [],
      pre_actions: [],
      post_actions: [],
      context_strategy: "append",
      respond_immediately: true,
    },
  ],
  allowInterruptions: true,
  llm: { provider: "openai", model: "gpt-4.1-mini" },
  stt: { engine: "deepgram", language: "en" },
  tts: { engine: "kokoro", voice: "af_heart", speed: 1 },
  idle: { timeout: 5, maxRetries: 2, holdMaxSec: 30 },
  vad: { responsiveness: "balanced" },
  transfer: {
    enabled: false, announcement: "", triggerPhrase: "", targets: [],
    accent: DEFAULT_ACCENT,
  },
  voicemail: {
    enabled: false,
    message: "Sorry we couldn't reach you. Please call us back at your convenience. Thank you.",
    responseDelay: 2,
  },
  ivr: { enabled: false, navigationPrompt: "" },
};

function EditorSkeleton() {
  return (
    <div className="space-y-5">
      <Skeleton className="h-40 w-full rounded-xl" />
      <Skeleton className="h-32 w-full rounded-xl" />
      <div className="grid gap-4 lg:grid-cols-[260px_1fr]">
        <Skeleton className="h-56 rounded-xl" />
        <Skeleton className="h-80 rounded-xl" />
      </div>
    </div>
  );
}

export default function FlowEditorPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const isNew = id === "new";

  const { data: flow, isLoading, error } = useQuery({
    queryKey: ["flows", id],
    queryFn: () => Flows.get(id),
    enabled: !isNew,
  });

  const pageTitle = isNew ? "New flow" : (flow?.name ?? "Edit flow");

  return (
    <div className="space-y-4">
      {/* ── Page header ──────────────────────────────────────── */}
      <div className="flex items-start gap-3">
        <Button
          variant="ghost"
          size="icon-sm"
          render={<Link href="/flows" />}
          aria-label="Back to flows"
          className="mt-0.5 shrink-0 text-muted-foreground hover:text-foreground"
        >
          <ArrowLeftIcon className="size-4" />
        </Button>
        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-primary/30 bg-primary/10 text-primary">
          {isNew ? (
            <SparklesIcon className="size-5" />
          ) : (
            <WorkflowIcon className="size-5" />
          )}
        </span>
        <div>
          <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            {isNew ? "New" : "Edit"} flow
          </p>
          <h1 className="mt-0.5 text-base font-semibold text-foreground">
            {pageTitle}
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            {isNew
              ? "Design the conversation as a graph: nodes, transitions, and actions."
              : "Edit the conversation graph, voice, and model."}
          </p>
        </div>
      </div>

      {!isNew && isLoading && <EditorSkeleton />}

      {!isNew && error && (
        <Card>
          <CardContent className="py-10 text-center">
            <p className="text-sm text-destructive">{parseApiError(error)}</p>
          </CardContent>
        </Card>
      )}

      {(isNew || (!isLoading && flow)) && (
        <FlowEditorForm
          flowId={isNew ? undefined : id}
          // Merge over NEW_DEFAULTS: flows saved before newer fields existed
          // (voicemail/ivr/transfer/idle/vad) lack those keys — undefined form
          // values would flip Base UI Switches from uncontrolled to controlled.
          defaultValues={isNew ? NEW_DEFAULTS : ({ ...NEW_DEFAULTS, ...(flow as Flow) })}
        />
      )}
    </div>
  );
}
