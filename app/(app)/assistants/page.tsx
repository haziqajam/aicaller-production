"use client";

import * as React from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Assistants } from "@/lib/api/resources";
import { AssistantCard } from "@/components/assistant-card";
import {
  AssistantsToolbar,
  type FacetConfig,
  type ToolbarFilters,
} from "@/components/assistants/assistants-toolbar";
import { useUrlPagination } from "@/lib/use-url-pagination";
import { PaginationBar } from "@/components/pagination-bar";
import { BrowserCallDialog } from "@/components/browser-call-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { TooltipProvider } from "@/components/ui/tooltip";
import { BotIcon, PlusIcon, SearchX } from "lucide-react";
import { PROVIDER_LABELS } from "@/lib/model-options";
import { TTS_LABEL } from "@/components/assistants/card-helpers";
import type { Assistant } from "@/lib/api/schemas";

/* ── Facets: client-side, computed from the loaded list's vocabulary ─────── */
const LLM_FACET: FacetConfig = {
  key: "llm",
  label: "Provider",
  options: Object.entries(PROVIDER_LABELS).map(([value, label]) => ({
    value,
    label,
  })),
};
const TTS_FACET: FacetConfig = {
  key: "tts",
  label: "Voice engine",
  options: Object.entries(TTS_LABEL).map(([value, label]) => ({
    value,
    label,
  })),
};
const FLAG_FACET: FacetConfig = {
  key: "flags",
  label: "Behavior",
  options: [
    { value: "prewarm", label: "Prewarm on" },
    { value: "transfer", label: "Transfer on" },
    { value: "bargein", label: "Barge-in on" },
    { value: "speaksFirst", label: "Speaks first" },
  ],
};
const FACETS = [LLM_FACET, TTS_FACET, FLAG_FACET];

function matches(a: Assistant, query: string, filters: ToolbarFilters): boolean {
  const q = query.trim().toLowerCase();
  if (q) {
    const hay = `${a.name ?? ""} ${a.systemPrompt ?? ""}`.toLowerCase();
    if (!hay.includes(q)) return false;
  }
  const llm = filters.llm ?? [];
  if (llm.length && !llm.includes(a.llm?.provider ?? "")) return false;

  const tts = filters.tts ?? [];
  if (tts.length && !tts.includes(a.tts?.engine ?? "")) return false;

  const flags = filters.flags ?? [];
  if (flags.includes("prewarm") && a.prewarm !== true) return false;
  if (flags.includes("transfer") && a.transfer?.enabled !== true) return false;
  if (flags.includes("bargein") && a.allowInterruptions === false) return false;
  if (flags.includes("speaksFirst") && a.firstMessageEnabled === false) return false;

  return true;
}

/* ── Skeletons (match the new card silhouette) ───────────────────────────── */
function AssistantCardSkeleton() {
  return (
    <div className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4">
      <div className="flex items-center gap-2.5">
        <Skeleton className="size-9 rounded-lg" />
        <div className="flex-1 space-y-1.5">
          <Skeleton className="h-3.5 w-32" />
          <Skeleton className="h-2.5 w-20" />
        </div>
      </div>
      <Skeleton className="h-20 w-full rounded-lg" />
      <div className="flex gap-1">
        <Skeleton className="h-10 flex-1 rounded-md" />
        <Skeleton className="h-10 flex-1 rounded-md" />
        <Skeleton className="h-10 flex-1 rounded-md" />
      </div>
      <div className="flex gap-1.5">
        <Skeleton className="h-5 w-20 rounded-md" />
        <Skeleton className="h-5 w-16 rounded-md" />
        <Skeleton className="h-5 w-18 rounded-md" />
      </div>
    </div>
  );
}

function AssistantsGridSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
      <AssistantCardSkeleton />
      <AssistantCardSkeleton />
      <AssistantCardSkeleton />
    </div>
  );
}

/**
 * Inner component uses nuqs hooks (useSearchParams under the hood).
 * Must be rendered inside a Suspense boundary.
 */
function AssistantsContent() {
  const { pageSize, setPage, setPageSize, paginate } = useUrlPagination({
    defaultSize: 12,
  });

  const { data: assistants, isLoading } = useQuery({
    queryKey: ["assistants"],
    queryFn: Assistants.list,
  });

  const [query, setQuery] = React.useState("");
  const [filters, setFilters] = React.useState<ToolbarFilters>({});

  const toggle = React.useCallback((key: string, value: string) => {
    setFilters((prev) => {
      const cur = prev[key] ?? [];
      const next = cur.includes(value)
        ? cur.filter((v) => v !== value)
        : [...cur, value];
      setPage(1);
      return { ...prev, [key]: next };
    });
  }, [setPage]);

  const clearAll = React.useCallback(() => {
    setFilters({});
    setQuery("");
    setPage(1);
  }, [setPage]);

  const all = assistants ?? [];
  const filtered = React.useMemo(
    () => all.filter((a) => matches(a, query, filters)),
    [all, query, filters]
  );

  const isEmpty = !isLoading && all.length === 0;
  const noResults = !isLoading && all.length > 0 && filtered.length === 0;

  const {
    items: pageAssistants,
    total,
    pageCount,
    page: currentPage,
  } = paginate(filtered);

  return (
    <div className="space-y-4">
      {/* ── Page header ──────────────────────────────────────── */}
      <div className="flex min-w-0 items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            Configuration
          </p>
          <h1 className="mt-0.5 text-base font-semibold text-foreground">
            Assistants
          </h1>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <BrowserCallDialog />
          <Button render={<Link href="/assistants/new" />}>
            <PlusIcon className="size-4" aria-hidden />
            New assistant
          </Button>
        </div>
      </div>

      {/* ── Loading skeletons ─────────────────────────────────── */}
      {isLoading && <AssistantsGridSkeleton />}

      {/* ── Teaching empty state (no assistants at all) ───────── */}
      {isEmpty && (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-14 text-center">
            <div className="flex size-11 items-center justify-center rounded-xl border border-primary/20 bg-primary/10">
              <BotIcon className="size-5 text-primary" aria-hidden />
            </div>
            <div className="space-y-1">
              <p className="text-sm font-medium">No assistants yet</p>
              <p className="mx-auto max-w-xs text-xs text-muted-foreground">
                Create an assistant to define its voice, language model, and
                conversation behavior.
              </p>
            </div>
            <Button render={<Link href="/assistants/new" />}>
              <PlusIcon className="size-4" aria-hidden />
              Create one
            </Button>
          </CardContent>
        </Card>
      )}

      {/* ── Toolbar + grid (has assistants) ───────────────────── */}
      {!isLoading && all.length > 0 && (
        <>
          <AssistantsToolbar
            query={query}
            onQueryChange={(q) => {
              setQuery(q);
              setPage(1);
            }}
            facets={FACETS}
            filters={filters}
            onToggle={toggle}
            onClearAll={clearAll}
            total={all.length}
            shown={filtered.length}
          />

          {noResults ? (
            <Card>
              <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
                <div className="flex size-10 items-center justify-center rounded-lg bg-muted">
                  <SearchX className="size-5 text-muted-foreground" aria-hidden />
                </div>
                <div className="space-y-1">
                  <p className="text-sm font-medium">No matching assistants</p>
                  <p className="mx-auto max-w-xs text-xs text-muted-foreground">
                    Try a different search term or clear your filters.
                  </p>
                </div>
                <Button variant="outline" size="sm" onClick={clearAll}>
                  Clear filters
                </Button>
              </CardContent>
            </Card>
          ) : (
            <>
              <TooltipProvider delay={300}>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  {pageAssistants.map((assistant) => (
                    <AssistantCard
                      key={assistant.id ?? assistant.name}
                      assistant={assistant}
                    />
                  ))}
                </div>
              </TooltipProvider>
              <PaginationBar
                page={currentPage}
                pageCount={pageCount}
                total={total}
                pageSize={pageSize}
                onPageChange={setPage}
                onPageSizeChange={setPageSize}
                itemLabel="assistants"
              />
            </>
          )}
        </>
      )}
    </div>
  );
}

/** Wrap in Suspense so useSearchParams (used by nuqs) doesn't break static generation. */
export default function AssistantsPage() {
  return (
    <React.Suspense fallback={<AssistantsGridSkeleton />}>
      <AssistantsContent />
    </React.Suspense>
  );
}
