"use client";

import { use } from "react";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { Assistants } from "@/lib/api/resources";
import { parseApiError } from "@/lib/api/errors";
import { type Assistant, DEFAULT_ACCENT } from "@/lib/api/schemas";
import { EditorForm } from "@/components/assistant-editor/editor-form";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowLeftIcon, BotIcon, SparklesIcon } from "lucide-react";

const NEW_DEFAULTS: Assistant = {
  name: "",
  systemPrompt: "",
  firstMessage: "",
  firstMessageEnabled: true,
  allowInterruptions: true,
  llm: { provider: "openai", model: "gpt-4.1-mini" },
  stt: { engine: "deepgram", language: "en" },
  tts: { engine: "kokoro", voice: "af_heart", speed: 1 },
  idle: { timeout: 5, maxRetries: 2, holdMaxSec: 30 },
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
  endCall: { enabled: false, goodbyeMessage: "", instructions: "", endCallPhrases: [] },
  vad: { responsiveness: "balanced" },
  toolIds: [],
  analysisQuestions: [],
  prewarm: false,
};

function EditorSkeleton() {
  return (
    <div className="space-y-5">
      {/* engine chain placeholder */}
      <div className="rounded-lg border border-border bg-muted/30 px-4 py-3">
        <div className="flex items-center gap-3">
          <Skeleton className="h-8 w-28 rounded-md" />
          <Skeleton className="size-4 rounded-sm" />
          <Skeleton className="h-8 w-20 rounded-md" />
          <Skeleton className="size-4 rounded-sm" />
          <Skeleton className="h-8 w-20 rounded-md" />
          <Skeleton className="size-4 rounded-sm" />
          <Skeleton className="h-8 w-24 rounded-md" />
        </div>
      </div>
      {/* tabs */}
      <div className="flex gap-1">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-9 w-20 rounded-md" />
        ))}
      </div>
      {/* form fields */}
      <div className="space-y-3">
        <Skeleton className="h-4 w-16 rounded" />
        <Skeleton className="h-9 w-full rounded-md" />
        <Skeleton className="h-4 w-24 rounded" />
        <Skeleton className="h-28 w-full rounded-md" />
        <Skeleton className="h-4 w-28 rounded" />
        <Skeleton className="h-20 w-full rounded-md" />
      </div>
    </div>
  );
}

export default function AssistantEditorPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const isNew = id === "new";

  const { data: assistant, isLoading, error } = useQuery({
    queryKey: ["assistants", id],
    queryFn: () => Assistants.get(id),
    enabled: !isNew,
  });

  const pageTitle = isNew ? "New assistant" : (assistant?.name ?? "Edit assistant");

  return (
    <div className="space-y-4">
      {/* ── Page header ──────────────────────────────────────── */}
      <div className="flex items-start gap-3">
        <Button
          variant="ghost"
          size="icon-sm"
          render={<Link href="/assistants" />}
          aria-label="Back to assistants"
          className="mt-0.5 shrink-0 text-muted-foreground hover:text-foreground"
        >
          <ArrowLeftIcon className="size-4" />
        </Button>
        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-primary/30 bg-primary/10 text-primary">
          {isNew ? (
            <SparklesIcon className="size-5" />
          ) : (
            <BotIcon className="size-5" />
          )}
        </span>
        <div>
          <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            {isNew ? "New" : "Edit"} assistant
          </p>
          <h1 className="mt-0.5 text-base font-semibold text-foreground">
            {pageTitle}
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            {isNew
              ? "Configure your new AI voice assistant."
              : "Edit identity, model, voice, and behavior."}
          </p>
        </div>
      </div>

      {!isNew && isLoading && <EditorSkeleton />}

      {!isNew && error && (
        <Card>
          <CardContent className="py-10 text-center">
            <p className="text-sm text-destructive">
              {parseApiError(error)}
            </p>
          </CardContent>
        </Card>
      )}

      {(isNew || (!isLoading && assistant)) && (
        <EditorForm
          assistantId={isNew ? undefined : id}
          defaultValues={isNew ? NEW_DEFAULTS : (assistant as Assistant)}
        />
      )}
    </div>
  );
}
