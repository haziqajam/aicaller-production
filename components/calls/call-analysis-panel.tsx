"use client";

import { useQuery } from "@tanstack/react-query";
import { Calls, type AnalysisAnswer } from "@/lib/api/resources";
import {
  CheckCircle2Icon,
  XCircleIcon,
  CircleHelpIcon,
  Loader2Icon,
  FileTextIcon,
  BracesIcon,
} from "lucide-react";

/**
 * Per-call end-call analysis: scores this call's transcript against its
 * campaign's boolean questions. Runs lazily on mount (cached server-side).
 */
export function CallAnalysisPanel({ callId }: { callId?: string }) {
  const { data, isLoading, isError } = useQuery({
    queryKey: ["calls", callId, "analysis"],
    queryFn: () => Calls.analyze(callId!),
    enabled: !!callId,
  });

  if (isLoading) {
    return (
      <p className="flex items-center gap-1.5 py-6 text-sm text-muted-foreground">
        <Loader2Icon className="size-4 animate-spin" aria-hidden />
        Scoring this call…
      </p>
    );
  }
  if (isError) {
    return <p className="py-6 text-sm text-destructive">Couldn&apos;t score this call.</p>;
  }
  if (!data || data.status === "no_questions") {
    return (
      <p className="py-6 text-sm text-muted-foreground">
        No analysis questions set for this call&apos;s assistant. Add them in the
        assistant editor to score calls.
      </p>
    );
  }
  if (data.status === "no_transcript") {
    return (
      <p className="py-6 text-sm text-muted-foreground">
        No transcript was captured for this call, so it can&apos;t be analyzed.
      </p>
    );
  }

  return (
    <div className="rounded-lg border border-border p-4">
      <ul className="space-y-3">
        {data.answers.map((a) => (
          <li key={a.id} className="flex items-start gap-2.5">
            <AnswerIcon answer={a} />
            <div className="min-w-0 flex-1">
              <p className="text-sm text-foreground">{a.text}</p>
              <AnswerBody answer={a} />
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function AnswerIcon({ answer: a }: { answer: AnalysisAnswer }) {
  const type = a.type ?? "boolean";
  if (type === "descriptive")
    return <FileTextIcon className="mt-0.5 size-4 shrink-0 text-sky-400" aria-hidden />;
  if (type === "json")
    return <BracesIcon className="mt-0.5 size-4 shrink-0 text-violet-400" aria-hidden />;
  if (a.answer === true)
    return <CheckCircle2Icon className="mt-0.5 size-4 shrink-0 text-emerald-400" aria-hidden />;
  if (a.answer === false)
    return <XCircleIcon className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />;
  return <CircleHelpIcon className="mt-0.5 size-4 shrink-0 text-muted-foreground/60" aria-hidden />;
}

function AnswerBody({ answer: a }: { answer: AnalysisAnswer }) {
  const type = a.type ?? "boolean";
  if (type === "descriptive") {
    return (
      <p className="text-xs text-muted-foreground">
        {typeof a.answer === "string" && a.answer
          ? a.answer
          : <span className="text-muted-foreground/60">No answer</span>}
        {a.evidence && <span className="text-muted-foreground/70"> · &ldquo;{a.evidence}&rdquo;</span>}
      </p>
    );
  }
  if (type === "json") {
    return a.answer && typeof a.answer === "object" ? (
      <pre className="mt-1 overflow-x-auto rounded-md border border-border bg-muted/40 p-2 text-[11px] leading-snug text-foreground">
        {JSON.stringify(a.answer, null, 2)}
      </pre>
    ) : (
      <p className="text-xs text-muted-foreground/60">Could not extract structured data.</p>
    );
  }
  // boolean
  return (
    <p className="text-xs text-muted-foreground">
      {a.answer === true ? "Yes" : a.answer === false ? "No" : "Unknown"}
      {a.evidence && <span className="text-muted-foreground/70"> · &ldquo;{a.evidence}&rdquo;</span>}
    </p>
  );
}
