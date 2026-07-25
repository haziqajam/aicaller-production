"use client";

import * as React from "react";
import Link from "next/link";
import { useQuery, keepPreviousData } from "@tanstack/react-query";
import {
  useQueryState,
  parseAsString,
} from "nuqs";
import { Calls, Assistants, type Paginated } from "@/lib/api/resources";
import { DataTable } from "@/components/data-table";
import { callsColumns, type CallRecord } from "@/components/calls/columns";
import { CallDetailDialog } from "@/components/calls/call-detail";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useUrlPagination } from "@/lib/use-url-pagination";
import { cn } from "@/lib/utils";
import { PhoneCallIcon, SearchIcon } from "lucide-react";

// Outcome facet — real terminal statuses stored by the backend (caller/db.py).
const OUTCOME_OPTIONS = [
  { value: "completed", label: "Completed" },
  { value: "no-answer", label: "No answer" },
  { value: "busy", label: "Busy" },
  { value: "failed", label: "Failed" },
  { value: "canceled", label: "Canceled" },
] as const;

function CallsTableSkeleton() {
  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <Skeleton className="h-7 w-32" />
        <Skeleton className="h-7 w-32" />
        <Skeleton className="h-7 w-48" />
      </div>
      <div className="rounded-lg border border-border overflow-hidden">
        <div className="divide-y divide-border">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3 px-3 py-1.5">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-4 w-20" />
              <Skeleton className="h-4 w-20" />
              <Skeleton className="h-4 w-12" />
              <Skeleton className="h-5 w-16 rounded-full" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/**
 * Inner component uses nuqs hooks (useSearchParams under the hood).
 * Must be rendered inside a Suspense boundary.
 *
 * All filtering is server-side: search → `q`, direction/outcome/date range →
 * query params, paging via useUrlPagination. The DataTable runs in manual mode
 * so it renders exactly the page the server returned (no client slice/filter).
 */
function CallsContent() {
  // Call selected for the detail modal
  const [selectedCall, setSelectedCall] = React.useState<CallRecord | null>(null);

  // page/size live in the URL (?page=&size=); they drive the SERVER fetch.
  const { page, pageSize, setPage, setPageSize } = useUrlPagination({ defaultSize: 20 });

  // URL-persisted filter state via nuqs
  const [direction, setDirection] = useQueryState(
    "direction",
    parseAsString.withDefault("all")
  );
  const [status, setStatus] = useQueryState(
    "status",
    parseAsString.withDefault("")
  );
  const [dateFrom, setDateFrom] = useQueryState(
    "from",
    parseAsString.withDefault("")
  );
  const [dateTo, setDateTo] = useQueryState(
    "to",
    parseAsString.withDefault("")
  );
  const [q, setQ] = useQueryState("q", parseAsString.withDefault(""));

  // Debounce the search box (~300ms) into the query param sent to the server.
  const [debouncedQ, setDebouncedQ] = React.useState(q);
  React.useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(q.trim()), 300);
    return () => clearTimeout(t);
  }, [q]);

  const safeDirection =
    direction === "inbound" || direction === "outbound" ? direction : "all";

  // Reset to page 1 whenever any filter changes (so we don't land on an empty
  // page beyond the new result set).
  const filterKey = `${safeDirection}|${status}|${debouncedQ}|${dateFrom}|${dateTo}`;
  const lastFilterKey = React.useRef(filterKey);
  React.useEffect(() => {
    if (lastFilterKey.current !== filterKey) {
      lastFilterKey.current = filterKey;
      setPage(1);
    }
  }, [filterKey, setPage]);

  const { data: pageData, isLoading, isFetching } = useQuery<Paginated<CallRecord>>({
    queryKey: [
      "calls",
      { page, pageSize, direction: safeDirection, status, q: debouncedQ, dateFrom, dateTo },
    ],
    queryFn: () =>
      Calls.list({
        skip: (page - 1) * pageSize,
        limit: pageSize,
        direction: safeDirection === "all" ? undefined : safeDirection,
        status: status || undefined,
        q: debouncedQ || undefined,
        dateFrom: dateFrom || undefined,
        dateTo: dateTo || undefined,
      }),
    placeholderData: keepPreviousData,
  });

  // Resolve assistant ids → names for display (list + modal).
  const { data: assistantsData } = useQuery({
    queryKey: ["assistants"],
    queryFn: Assistants.list,
  });
  const assistantNames = React.useMemo(() => {
    const m = new Map<string, string>();
    for (const a of assistantsData ?? []) if (a.id) m.set(a.id, a.name);
    return m;
  }, [assistantsData]);

  // Decorate the server page with resolved assistant names (display only).
  const calls: CallRecord[] = React.useMemo(
    () =>
      (pageData?.items ?? []).map((c) => ({
        ...c,
        assistantName: c.assistantId
          ? assistantNames.get(c.assistantId) ?? c.assistantName
          : c.assistantName,
      })),
    [pageData, assistantNames]
  );
  const total = pageData?.total ?? 0;

  const hasFilters = Boolean(
    safeDirection !== "all" || status || debouncedQ || dateFrom || dateTo
  );
  const isEmpty = !isLoading && total === 0;

  return (
    <div className="space-y-4">
      {/* ── Page header ──────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            History
          </p>
          <h1 className="mt-0.5 text-base font-semibold text-foreground">
            Calls
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            All inbound and outbound call records.
          </p>
        </div>
      </div>

      {/* ── Search ───────────────────────────────────────────── */}
      <div className="relative max-w-sm">
        <SearchIcon
          className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground"
          aria-hidden
        />
        <Input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value || null)}
          placeholder="Search by number or call SID…"
          aria-label="Search calls"
          className="h-8 pl-8"
        />
      </div>

      {/* ── Direction + outcome + date-range filters (URL-persisted) ── */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
          Direction
        </span>
        {(["all", "outbound", "inbound"] as const).map((d) => (
          <button
            key={d}
            className={cn(
              "rounded-md px-2.5 py-1 text-xs font-medium border transition-colors duration-150",
              safeDirection === d
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border bg-background text-foreground hover:bg-muted/50"
            )}
            onClick={() => setDirection(d === "all" ? null : d)}
          >
            {d.charAt(0).toUpperCase() + d.slice(1)}
          </button>
        ))}

        <span className="ml-2 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
          Outcome
        </span>
        <button
          className={cn(
            "rounded-md px-2.5 py-1 text-xs font-medium border transition-colors duration-150",
            !status
              ? "border-primary bg-primary text-primary-foreground"
              : "border-border bg-background text-foreground hover:bg-muted/50"
          )}
          onClick={() => setStatus(null)}
        >
          All
        </button>
        {OUTCOME_OPTIONS.map((o) => (
          <button
            key={o.value}
            className={cn(
              "rounded-md px-2.5 py-1 text-xs font-medium border transition-colors duration-150",
              status === o.value
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border bg-background text-foreground hover:bg-muted/50"
            )}
            onClick={() => setStatus(status === o.value ? null : o.value)}
          >
            {o.label}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
          From
        </span>
        <input
          type="date"
          value={dateFrom}
          onChange={(e) => setDateFrom(e.target.value || null)}
          className="tabular h-7 rounded-md border border-border bg-background px-2 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring transition-colors duration-150"
        />
        <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
          To
        </span>
        <input
          type="date"
          value={dateTo}
          onChange={(e) => setDateTo(e.target.value || null)}
          className="tabular h-7 rounded-md border border-border bg-background px-2 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring transition-colors duration-150"
        />

        {(dateFrom || dateTo) && (
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-xs text-muted-foreground"
            onClick={() => {
              setDateFrom(null);
              setDateTo(null);
            }}
          >
            Clear dates
          </Button>
        )}
      </div>

      {/* ── Loading skeletons ─────────────────────────────────── */}
      {isLoading && <CallsTableSkeleton />}

      {/* ── Teaching empty state (no calls at all, no filters) ── */}
      {isEmpty && !hasFilters && (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-14 text-center">
            <div className="flex size-10 items-center justify-center rounded-lg bg-muted">
              <PhoneCallIcon className="size-5 text-muted-foreground" aria-hidden />
            </div>
            <div className="space-y-1">
              <p className="text-sm font-medium">No calls yet</p>
              <p className="text-xs text-muted-foreground max-w-xs">
                Calls appear here once you run a campaign or receive an inbound
                call on a mapped number.
              </p>
            </div>
            <Button render={<Link href="/campaigns" />}>
              Go to Campaigns
            </Button>
          </CardContent>
        </Card>
      )}

      {/* ── Calls data-table (server pagination) ──────────────── */}
      {!isLoading && (total > 0 || hasFilters) && (
        <div className={isFetching ? "opacity-70 transition-opacity" : undefined}>
          <DataTable<CallRecord, unknown>
            columns={callsColumns}
            data={calls}
            manualPagination
            page={page}
            pageSize={pageSize}
            rowCount={total}
            onPageChange={setPage}
            onPageSizeChange={setPageSize}
            getRowId={(row) => row.id ?? Math.random().toString()}
            emptyState="No calls match the current filters."
            toolbar={null}
            onRowClick={(row) => setSelectedCall(row)}
          />
        </div>
      )}

      {/* ── Call detail modal ─────────────────────────────────── */}
      <CallDetailDialog
        call={selectedCall}
        assistantName={selectedCall?.assistantName}
        onOpenChange={(open) => {
          if (!open) setSelectedCall(null);
        }}
      />
    </div>
  );
}

/** Wrap in Suspense so useSearchParams (used by nuqs) doesn't break static generation. */
export default function CallsPage() {
  return (
    <React.Suspense fallback={<CallsTableSkeleton />}>
      <CallsContent />
    </React.Suspense>
  );
}
