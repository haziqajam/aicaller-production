"use client";

import * as React from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Flows } from "@/lib/api/resources";
import { FlowCard } from "@/components/flow-card";
import { FlowCallDialog } from "@/components/flow-call-dialog";
import { useUrlPagination } from "@/lib/use-url-pagination";
import { PaginationBar } from "@/components/pagination-bar";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { WorkflowIcon, PlusIcon, SearchX, SearchIcon } from "lucide-react";
import type { Flow } from "@/lib/api/schemas";

/* ── Skeletons (match the card silhouette) ───────────────────────────────── */
function FlowCardSkeleton() {
  return (
    <div className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4">
      <div className="flex items-center gap-2.5">
        <Skeleton className="size-9 rounded-lg" />
        <div className="flex-1 space-y-1.5">
          <Skeleton className="h-3.5 w-32" />
          <Skeleton className="h-2.5 w-20" />
        </div>
      </div>
      <Skeleton className="h-16 w-full rounded-lg" />
      <Skeleton className="h-10 w-full rounded-md" />
    </div>
  );
}

function FlowsGridSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
      <FlowCardSkeleton />
      <FlowCardSkeleton />
      <FlowCardSkeleton />
    </div>
  );
}

function FlowsContent() {
  const { pageSize, setPage, setPageSize, paginate } = useUrlPagination({
    defaultSize: 12,
  });

  const { data: flows, isLoading } = useQuery({
    queryKey: ["flows"],
    queryFn: Flows.list,
  });

  const [query, setQuery] = React.useState("");

  const all = flows ?? [];
  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return all;
    return all.filter((f: Flow) =>
      `${f.name ?? ""} ${f.description ?? ""}`.toLowerCase().includes(q));
  }, [all, query]);

  const isEmpty = !isLoading && all.length === 0;
  const noResults = !isLoading && all.length > 0 && filtered.length === 0;

  const { items: pageFlows, total, pageCount, page: currentPage } = paginate(filtered);

  return (
    <div className="space-y-4">
      {/* ── Page header ──────────────────────────────────────── */}
      <div className="flex min-w-0 items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            Configuration
          </p>
          <h1 className="mt-0.5 text-base font-semibold text-foreground">
            Flows
          </h1>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <FlowCallDialog />
          <Button render={<Link href="/flows/new" />}>
            <PlusIcon className="size-4" aria-hidden />
            New flow
          </Button>
        </div>
      </div>

      {/* ── Loading skeletons ─────────────────────────────────── */}
      {isLoading && <FlowsGridSkeleton />}

      {/* ── Teaching empty state ──────────────────────────────── */}
      {isEmpty && (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-14 text-center">
            <div className="flex size-11 items-center justify-center rounded-xl border border-primary/20 bg-primary/10">
              <WorkflowIcon className="size-5 text-primary" aria-hidden />
            </div>
            <div className="space-y-1">
              <p className="text-sm font-medium">No flows yet</p>
              <p className="mx-auto max-w-xs text-xs text-muted-foreground">
                A flow is a structured conversation graph: nodes with goals,
                transitions the model triggers, and actions like speaking a line
                or ending the call. Build one, test it in the browser, then
                attach it to a campaign — just like an assistant.
              </p>
            </div>
            <Button render={<Link href="/flows/new" />}>
              <PlusIcon className="size-4" aria-hidden />
              Create one
            </Button>
          </CardContent>
        </Card>
      )}

      {/* ── Search + grid ─────────────────────────────────────── */}
      {!isLoading && all.length > 0 && (
        <>
          <div className="relative max-w-xs">
            <SearchIcon className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <Input
              value={query}
              onChange={(e) => { setQuery(e.target.value); setPage(1); }}
              placeholder="Search flows…"
              className="pl-8"
            />
          </div>

          {noResults ? (
            <Card>
              <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
                <div className="flex size-10 items-center justify-center rounded-lg bg-muted">
                  <SearchX className="size-5 text-muted-foreground" aria-hidden />
                </div>
                <div className="space-y-1">
                  <p className="text-sm font-medium">No matching flows</p>
                  <p className="mx-auto max-w-xs text-xs text-muted-foreground">
                    Try a different search term.
                  </p>
                </div>
                <Button variant="outline" size="sm" onClick={() => setQuery("")}>
                  Clear search
                </Button>
              </CardContent>
            </Card>
          ) : (
            <>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {pageFlows.map((flow) => (
                  <FlowCard key={flow.id ?? flow.name} flow={flow} />
                ))}
              </div>
              <PaginationBar
                page={currentPage}
                pageCount={pageCount}
                total={total}
                pageSize={pageSize}
                onPageChange={setPage}
                onPageSizeChange={setPageSize}
                itemLabel="flows"
              />
            </>
          )}
        </>
      )}
    </div>
  );
}

/** Wrap in Suspense so useSearchParams (used by the pagination hook) doesn't break static generation. */
export default function FlowsPage() {
  return (
    <React.Suspense fallback={<FlowsGridSkeleton />}>
      <FlowsContent />
    </React.Suspense>
  );
}
