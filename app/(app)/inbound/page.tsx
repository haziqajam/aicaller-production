"use client";

import * as React from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Assistants, Numbers } from "@/lib/api/resources";
import { toastApiError } from "@/lib/api/errors";
import { useUrlPagination } from "@/lib/use-url-pagination";
import { PaginationBar } from "@/components/pagination-bar";
import {
  AttachNumberDialog,
  DetachNumberButton,
  numberLabel,
  numberAssistantId,
  type NumberRecord,
} from "@/components/inbound/attach-number-dialog";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { CardEngineChain } from "@/components/assistants/card-engine-chain";
import {
  sttLabel,
  ttsLabel,
  providerLabel,
  modelLabel,
} from "@/components/assistants/card-helpers";
import {
  PhoneIncomingIcon,
  BotIcon,
  PhoneIcon,
  PlusIcon,
  AlertCircleIcon,
  CheckCircle2,
} from "lucide-react";
import { DataToolbar, useDataToolbar } from "@/components/data-toolbar";

interface AssistantRecord {
  id?: string;
  name: string;
  tts?: { engine?: string; voice?: string };
  stt?: { engine?: string };
  llm?: { provider?: string; model?: string };
}

function InboundSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="rounded-lg border border-border bg-card p-4 space-y-3">
          <div className="flex items-center gap-3">
            <Skeleton className="size-9 rounded-lg" />
            <Skeleton className="h-4 w-32" />
          </div>
          <Skeleton className="h-6 w-44 rounded-full" />
          <Skeleton className="h-8 w-32 rounded-md" />
        </div>
      ))}
    </div>
  );
}

/** One stat in the inbound overview — a standalone card with an accented icon
 *  badge so each metric reads as a distinct unit (separation + hierarchy). */
const STAT_TONES: Record<string, string> = {
  primary: "border-primary/25 bg-primary/10 text-primary",
  sky: "border-sky-500/30 bg-sky-500/10 text-sky-400",
  emerald: "border-emerald-500/30 bg-emerald-500/10 text-emerald-400",
  amber: "border-amber-500/30 bg-amber-500/10 text-amber-400",
};

function StatCard({
  icon: Icon,
  label,
  value,
  tone = "primary",
}: {
  icon: React.ElementType;
  label: string;
  value: number;
  tone?: keyof typeof STAT_TONES;
}) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-border bg-card p-4 shadow-xs">
      <span
        className={cn(
          "flex size-9 shrink-0 items-center justify-center rounded-lg border",
          STAT_TONES[tone]
        )}
      >
        <Icon className="size-4" aria-hidden />
      </span>
      <div className="min-w-0">
        <p className="tabular-nums text-xl font-semibold leading-none text-foreground">
          {value}
        </p>
        <p className="mt-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
          {label}
        </p>
      </div>
    </div>
  );
}

function InboundContent() {
  const { pageSize, setPage, setPageSize, paginate } = useUrlPagination({
    defaultSize: 8,
  });

  const assistantsQuery = useQuery<AssistantRecord[]>({
    queryKey: ["assistants"],
    queryFn: Assistants.list,
  });
  const numbersQuery = useQuery<NumberRecord[]>({
    queryKey: ["numbers"],
    queryFn: Numbers.list,
  });

  React.useEffect(() => {
    if (numbersQuery.error) toastApiError(numbersQuery.error, "Couldn't load numbers");
    if (assistantsQuery.error)
      toastApiError(assistantsQuery.error, "Couldn't load agents");
  }, [numbersQuery.error, assistantsQuery.error]);

  const isLoading = assistantsQuery.isLoading || numbersQuery.isLoading;
  const assistants = React.useMemo(
    () => assistantsQuery.data ?? [],
    [assistantsQuery.data]
  );
  const numbers = React.useMemo(
    () => numbersQuery.data ?? [],
    [numbersQuery.data]
  );

  // assistantId -> name (for "routed to X" labels in the attach dialog)
  const assistantNames = React.useMemo(() => {
    const m = new Map<string, string>();
    for (const a of assistants) if (a.id) m.set(a.id, a.name);
    return m;
  }, [assistants]);

  // assistantId -> attached numbers
  const numbersByAgent = React.useMemo(() => {
    const m = new Map<string, NumberRecord[]>();
    for (const n of numbers) {
      const aid = numberAssistantId(n);
      if (!aid) continue;
      const list = m.get(aid) ?? [];
      list.push(n);
      m.set(aid, list);
    }
    return m;
  }, [numbers]);

  const routedCount = numbers.filter((n) => numberAssistantId(n)).length;
  const unroutedCount = numbers.length - routedCount;

  // Search by agent name + filter by whether the agent has any number routed.
  const tb = useDataToolbar(assistants, {
    search: (a) => a.name,
    facets: [
      {
        key: "routing",
        label: "Routing",
        options: [
          { value: "routed", label: "Has numbers" },
          { value: "unrouted", label: "No numbers" },
        ],
        get: (a) =>
          a.id && (numbersByAgent.get(a.id)?.length ?? 0) > 0
            ? "routed"
            : "unrouted",
      },
    ],
  });

  const isEmpty = !isLoading && assistants.length === 0;
  const noMatches = !isLoading && assistants.length > 0 && tb.shown === 0;
  const { items: pageAssistants, total, pageCount, page } = paginate(tb.filtered);

  return (
    <div className="space-y-4">
      {/* ── Page header ──────────────────────────────────────── */}
      <div className="flex items-start gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-primary/30 bg-primary/10 text-primary">
          <PhoneIncomingIcon className="size-5" aria-hidden />
        </span>
        <div className="min-w-0">
          <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            Inbound
          </p>
          <h1 className="mt-0.5 text-base font-semibold text-foreground">
            Inbound routing
          </h1>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Attach purchased phone numbers to agents — the attached agent answers
            when that number is called.
          </p>
        </div>
      </div>

      {/* ── Overview stats — one card per metric ─────────────── */}
      {!isLoading && assistants.length > 0 && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatCard icon={BotIcon} label="Agents" value={assistants.length} tone="primary" />
          <StatCard icon={PhoneIcon} label="Numbers" value={numbers.length} tone="sky" />
          <StatCard icon={CheckCircle2} label="Routed" value={routedCount} tone="emerald" />
          <StatCard icon={AlertCircleIcon} label="Unrouted" value={unroutedCount} tone="amber" />
        </div>
      )}

      {/* ── Search + filter ──────────────────────────────────── */}
      {!isLoading && assistants.length > 0 && (
        <DataToolbar
          {...tb.toolbarProps}
          noun="agent"
          searchPlaceholder="Search agents…"
        />
      )}

      {isLoading && <InboundSkeleton />}

      {/* ── No agents ────────────────────────────────────────── */}
      {isEmpty && (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-14 text-center">
            <div className="flex size-10 items-center justify-center rounded-lg bg-muted">
              <BotIcon className="size-5 text-muted-foreground" aria-hidden />
            </div>
            <div className="space-y-1">
              <p className="text-sm font-medium">No agents yet</p>
              <p className="max-w-xs text-xs text-muted-foreground">
                Create an assistant first, then attach a phone number so it can
                answer inbound calls.
              </p>
            </div>
            <Button render={<Link href="/assistants/new" />}>
              <PlusIcon className="size-4" aria-hidden />
              Create an agent
            </Button>
          </CardContent>
        </Card>
      )}

      {/* ── No numbers hint (agents exist but nothing purchased) ── */}
      {!isLoading && assistants.length > 0 && numbers.length === 0 && (
        <div className="flex items-center gap-2 rounded-lg border border-amber-500/25 bg-amber-500/8 px-3 py-2 text-xs text-amber-500">
          <AlertCircleIcon className="size-4 shrink-0" aria-hidden />
          <span>
            No phone numbers purchased yet.{" "}
            <Link
              href="/numbers"
              className="font-medium underline underline-offset-2"
            >
              Buy a number
            </Link>{" "}
            to start routing inbound calls.
          </span>
        </div>
      )}

      {/* ── No matching agents ───────────────────────────────── */}
      {noMatches && (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
            <div className="flex size-10 items-center justify-center rounded-lg bg-muted">
              <BotIcon className="size-5 text-muted-foreground" aria-hidden />
            </div>
            <div className="space-y-1">
              <p className="text-sm font-medium">No agents match your search</p>
              <p className="max-w-xs text-xs text-muted-foreground">
                Try a different name or clear the filters.
              </p>
            </div>
            <Button variant="outline" size="sm" onClick={tb.clearAll}>
              Clear filters
            </Button>
          </CardContent>
        </Card>
      )}

      {/* ── Agent grid ───────────────────────────────────────── */}
      {!isLoading && pageAssistants.length > 0 && (
        <>
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            {pageAssistants.map((agent) => {
              const attached = agent.id
                ? numbersByAgent.get(agent.id) ?? []
                : [];
              return (
                <div
                  key={agent.id ?? agent.name}
                  className={cn(
                    "group relative flex min-w-0 flex-col overflow-hidden rounded-xl border border-border bg-card",
                    "shadow-xs transition-all duration-200",
                    "hover:border-primary/30 hover:shadow-md focus-within:border-ring/50"
                  )}
                >
                  {/* Accent hairline on hover — matches the assistant card */}
                  <span
                    aria-hidden
                    className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary/40 to-transparent opacity-0 transition-opacity duration-200 group-hover:opacity-100"
                  />

                  {/* Header */}
                  <div className="flex items-start justify-between gap-2 p-4 pb-3">
                    <div className="flex min-w-0 items-center gap-2.5">
                      <div className="relative flex size-9 shrink-0 items-center justify-center rounded-lg border border-primary/20 bg-primary/10">
                        <BotIcon className="size-4 text-primary" aria-hidden />
                      </div>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-foreground">
                          {agent.name}
                        </p>
                        <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
                          <PhoneIcon className="size-2.5" aria-hidden />
                          {attached.length} number
                          {attached.length !== 1 ? "s" : ""} routed
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Engine pipeline (STT → LLM → TTS) — same as assistant card */}
                  <div className="px-4">
                    <CardEngineChain
                      sttEngine={agent.stt?.engine ?? "deepgram"}
                      sttLabel={sttLabel(agent.stt?.engine)}
                      llmProvider={agent.llm?.provider ?? "openai"}
                      llmLabel={`${providerLabel(agent.llm?.provider)} · ${modelLabel(
                        agent.llm?.provider,
                        agent.llm?.model
                      )}`}
                      ttsEngine={agent.tts?.engine ?? "kokoro"}
                      ttsLabel={ttsLabel(agent.tts?.engine)}
                    />
                  </div>

                  {/* Attached numbers */}
                  <div className="px-4 pt-3">
                    {attached.length > 0 ? (
                      <div className="flex flex-wrap gap-1.5">
                        {attached.map((n) => (
                          <span
                            key={n.id}
                            className="tabular inline-flex items-center gap-1.5 rounded-full border border-border bg-muted/60 py-0.5 pl-2 pr-1 text-[11px] font-medium text-foreground/80"
                          >
                            <PhoneIcon
                              className="size-3 text-muted-foreground"
                              aria-hidden
                            />
                            {numberLabel(n)}
                            <DetachNumberButton
                              numberId={n.id}
                              label={numberLabel(n)}
                              agentName={agent.name}
                            />
                          </span>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-muted-foreground">
                        No numbers routed — inbound calls won&apos;t reach this
                        agent yet.
                      </p>
                    )}
                  </div>

                  {/* Footer: attach action */}
                  <div className="mt-auto p-4 pt-3">
                    <AttachNumberDialog
                      agentId={agent.id ?? ""}
                      agentName={agent.name}
                      numbers={numbers}
                      assistantNames={assistantNames}
                    />
                  </div>
                </div>
              );
            })}
          </div>

          <PaginationBar
            page={page}
            pageCount={pageCount}
            total={total}
            pageSize={pageSize}
            onPageChange={setPage}
            onPageSizeChange={setPageSize}
            itemLabel="agents"
          />
        </>
      )}
    </div>
  );
}

export default function InboundPage() {
  return (
    <React.Suspense fallback={<InboundSkeleton />}>
      <InboundContent />
    </React.Suspense>
  );
}
