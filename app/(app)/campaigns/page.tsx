"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { useQueryState, parseAsString } from "nuqs";
import {
  Campaigns,
  Assistants,
  Flows,
  LeadLists,
  type Paginated,
} from "@/lib/api/resources";
import { useUrlPagination } from "@/lib/use-url-pagination";
import { PaginationBar } from "@/components/pagination-bar";
import { StatusChip } from "@/components/status-chip";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  MegaphoneIcon,
  PlusIcon,
  BotIcon,
  WorkflowIcon,
  PhoneOutgoingIcon,
  UsersIcon,
  GaugeIcon,
  SearchIcon,
} from "lucide-react";

type CampaignRecord = {
  id?: string;
  assistantId?: string | null;
  // Flow campaigns reference a Pipecat Flow instead of an assistant.
  flowId?: string | null;
  fromNumber?: string;
  concurrency?: number;
  status?: string;
  // New campaigns snapshot from a lead list (listId) and leave leadIds empty;
  // legacy campaigns carry explicit leadIds. The Leads count must handle both.
  leadIds?: string[];
  listId?: string;
  created_at?: string;
};

// Status facet — the backend's campaign states.
const STATUS_OPTIONS = [
  { value: "draft", label: "Draft" },
  { value: "running", label: "Running" },
  { value: "stopped", label: "Stopped" },
  { value: "done", label: "Done" },
  { value: "completed", label: "Completed" },
] as const;

function CampaignRowSkeleton() {
  return (
    <TableRow>
      <TableCell><Skeleton className="h-3.5 w-28" /></TableCell>
      <TableCell><Skeleton className="h-3.5 w-32" /></TableCell>
      <TableCell><Skeleton className="h-3.5 w-10" /></TableCell>
      <TableCell><Skeleton className="h-3.5 w-6" /></TableCell>
      <TableCell><Skeleton className="h-5 w-16 rounded-full" /></TableCell>
      <TableCell><Skeleton className="h-3.5 w-20" /></TableCell>
    </TableRow>
  );
}

function HeaderCell({ children }: { children: React.ReactNode }) {
  return (
    <TableHead className="text-[10px] uppercase tracking-wider text-muted-foreground">
      {children}
    </TableHead>
  );
}

function CampaignsTableSkeleton() {
  return (
    <div className="rounded-lg border border-border overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow>
            <HeaderCell>Assistant</HeaderCell>
            <HeaderCell>From</HeaderCell>
            <HeaderCell>Leads</HeaderCell>
            <HeaderCell>Concurrency</HeaderCell>
            <HeaderCell>Status</HeaderCell>
            <HeaderCell>Created</HeaderCell>
          </TableRow>
        </TableHeader>
        <TableBody>
          <CampaignRowSkeleton />
          <CampaignRowSkeleton />
          <CampaignRowSkeleton />
          <CampaignRowSkeleton />
        </TableBody>
      </Table>
    </div>
  );
}

/**
 * Inner component uses nuqs hooks (useSearchParams under the hood). Must be
 * rendered inside a Suspense boundary.
 *
 * All filtering is server-side: search → `q` (matched over fromNumber in the
 * DB), status facet → `status`, paging via useUrlPagination. The table renders
 * exactly the page the server returned (no client slice/filter). Assistant names
 * are resolved client-side (the assistant NAME isn't on the campaign doc, so it
 * can't be searched server-side) — search by number instead.
 */
function CampaignsContent() {
  const router = useRouter();

  // page/size live in the URL (?page=&size=); they drive the SERVER fetch.
  const { page, pageSize, setPage, setPageSize } = useUrlPagination({
    defaultSize: 20,
  });

  // URL-persisted filter state via nuqs.
  const [status, setStatus] = useQueryState(
    "status",
    parseAsString.withDefault("")
  );
  const [q, setQ] = useQueryState("q", parseAsString.withDefault(""));

  // Debounce the search box (~300ms) into the query param sent to the server.
  const [debouncedQ, setDebouncedQ] = React.useState(q);
  React.useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(q.trim()), 300);
    return () => clearTimeout(t);
  }, [q]);

  // Reset to page 1 whenever a filter changes (so we don't land on an empty page
  // beyond the new result set).
  const filterKey = `${status}|${debouncedQ}`;
  const lastFilterKey = React.useRef(filterKey);
  React.useEffect(() => {
    if (lastFilterKey.current !== filterKey) {
      lastFilterKey.current = filterKey;
      setPage(1);
    }
  }, [filterKey, setPage]);

  const { data: pageData, isLoading, isFetching } = useQuery<
    Paginated<CampaignRecord>
  >({
    queryKey: ["campaigns", { page, pageSize, status, q: debouncedQ }],
    queryFn: () =>
      Campaigns.list({
        skip: (page - 1) * pageSize,
        limit: pageSize,
        status: status || undefined,
        q: debouncedQ || undefined,
      }),
    placeholderData: keepPreviousData,
  });

  // Resolve assistant/flow ObjectIds → human names for the table.
  const { data: assistants } = useQuery({
    queryKey: ["assistants"],
    queryFn: Assistants.list,
  });
  const { data: flows } = useQuery({
    queryKey: ["flows"],
    queryFn: Flows.list,
  });

  // Lead lists resolve the lead count for list-backed campaigns (which carry a
  // listId + empty leadIds). Lead LISTS are low-volume, so this stays a bare
  // array (NOT paginated) — resolveLeadCount needs them all.
  const { data: leadLists } = useQuery({
    queryKey: ["lead-lists"],
    queryFn: LeadLists.list,
  });

  const assistantNames = new Map<string, string>(
    (assistants ?? [])
      .filter((a) => a.id)
      .map((a) => [a.id as string, a.name])
  );

  const listLeadCount = new Map<string, number>(
    (leadLists ?? [])
      .filter((l) => l.id)
      .map((l) => [l.id as string, l.leadCount ?? 0])
  );

  const flowNames = new Map<string, string>(
    (flows ?? [])
      .filter((f) => f.id)
      .map((f) => [f.id as string, f.name])
  );

  function resolveAssistant(id?: string | null): string {
    if (!id) return "—";
    return assistantNames.get(id) ?? `${id.slice(0, 8)}…`;
  }

  /** Agent label: the flow's name for flow campaigns, else the assistant's. */
  function resolveAgent(c: CampaignRecord): string {
    if (c.flowId) return flowNames.get(c.flowId) ?? `${c.flowId.slice(0, 8)}…`;
    return resolveAssistant(c.assistantId);
  }

  function resolveLeadCount(c: CampaignRecord): number {
    if (c.listId) return listLeadCount.get(c.listId) ?? 0;
    return c.leadIds?.length ?? 0;
  }

  const campaigns: CampaignRecord[] = pageData?.items ?? [];
  const total = pageData?.total ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));

  const hasFilters = Boolean(status || debouncedQ);
  const isEmpty = !isLoading && total === 0;

  return (
    <div className="space-y-4">
      {/* ── Page header ──────────────────────────────────────── */}
      <div className="flex items-start gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-primary/30 bg-primary/10 text-primary">
          <MegaphoneIcon className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            Outbound
          </p>
          <h1 className="mt-0.5 text-base font-semibold text-foreground">
            Campaigns
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            All outbound call campaigns.
          </p>
        </div>
        <Button render={<Link href="/campaigns/new" />} className="shrink-0">
          <PlusIcon className="size-4" aria-hidden />
          Launch campaign
        </Button>
      </div>

      {/* ── Search (server `q` over from-number) ─────────────── */}
      <div className="relative max-w-sm">
        <SearchIcon
          className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground"
          aria-hidden
        />
        <Input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value || null)}
          placeholder="Search by from-number…"
          aria-label="Search campaigns"
          className="h-8 pl-8"
        />
      </div>

      {/* ── Status facet (URL-persisted) ──────────────────────── */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
          Status
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
        {STATUS_OPTIONS.map((o) => (
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

      {/* ── Loading skeletons ─────────────────────────────────── */}
      {isLoading && <CampaignsTableSkeleton />}

      {/* ── Teaching empty state (no campaigns at all, no filters) ── */}
      {isEmpty && !hasFilters && (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-14 text-center">
            <div className="flex size-10 items-center justify-center rounded-lg bg-muted">
              <MegaphoneIcon className="size-5 text-muted-foreground" aria-hidden />
            </div>
            <div className="space-y-1">
              <p className="text-sm font-medium">No campaigns yet</p>
              <p className="text-xs text-muted-foreground max-w-xs">
                Launch one to start making outbound calls and see live progress
                here.
              </p>
            </div>
            <Button render={<Link href="/campaigns/new" />}>
              <PlusIcon className="size-4" aria-hidden />
              Launch one
            </Button>
          </CardContent>
        </Card>
      )}

      {/* ── No results for the active search/filters ──────────── */}
      {isEmpty && hasFilters && (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-14 text-center">
            <div className="flex size-10 items-center justify-center rounded-lg bg-muted">
              <MegaphoneIcon className="size-5 text-muted-foreground" aria-hidden />
            </div>
            <div className="space-y-1">
              <p className="text-sm font-medium">
                No campaigns match your filters
              </p>
              <p className="text-xs text-muted-foreground max-w-xs">
                Try a different search term or clear the active filters.
              </p>
            </div>
            <Button
              variant="outline"
              onClick={() => {
                setQ(null);
                setStatus(null);
              }}
            >
              Clear filters
            </Button>
          </CardContent>
        </Card>
      )}

      {/* ── Campaigns table (server pagination) ───────────────── */}
      {!isLoading && total > 0 && (
        <div className={isFetching ? "opacity-70 transition-opacity" : undefined}>
          <div className="rounded-lg border border-border overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <HeaderCell>Agent</HeaderCell>
                  <HeaderCell>From</HeaderCell>
                  <HeaderCell>Leads</HeaderCell>
                  <HeaderCell>Concurrency</HeaderCell>
                  <HeaderCell>Status</HeaderCell>
                  <HeaderCell>Created</HeaderCell>
                </TableRow>
              </TableHeader>
              <TableBody>
                {campaigns.map((c) => (
                  <TableRow
                    key={c.id}
                    className="cursor-pointer transition-colors duration-150 hover:bg-muted/30 focus-visible:outline-none focus-visible:bg-muted/30"
                    onClick={() => router.push(`/campaigns/${c.id}`)}
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        router.push(`/campaigns/${c.id}`);
                      }
                    }}
                  >
                    <TableCell>
                      <span className="flex items-center gap-2 text-sm text-foreground">
                        <span className="flex size-6 shrink-0 items-center justify-center rounded-md bg-primary/10">
                          {c.flowId ? (
                            <WorkflowIcon className="size-3.5 text-primary" aria-hidden />
                          ) : (
                            <BotIcon className="size-3.5 text-primary" aria-hidden />
                          )}
                        </span>
                        <span className="truncate font-medium">
                          {resolveAgent(c)}
                        </span>
                      </span>
                    </TableCell>
                    <TableCell>
                      <span className="flex items-center gap-1.5 text-sm text-foreground tabular">
                        <PhoneOutgoingIcon
                          className="size-3.5 shrink-0 text-muted-foreground"
                          aria-hidden
                        />
                        {c.fromNumber ?? "—"}
                      </span>
                    </TableCell>
                    <TableCell>
                      <span className="flex items-center gap-1.5 text-sm text-foreground tabular">
                        <UsersIcon
                          className="size-3.5 shrink-0 text-muted-foreground"
                          aria-hidden
                        />
                        {resolveLeadCount(c).toLocaleString()}
                      </span>
                    </TableCell>
                    <TableCell>
                      <span className="flex items-center gap-1.5 text-sm text-foreground tabular">
                        <GaugeIcon
                          className="size-3.5 shrink-0 text-muted-foreground"
                          aria-hidden
                        />
                        {c.concurrency ?? 1}
                      </span>
                    </TableCell>
                    <TableCell>
                      <StatusChip status={c.status ?? "draft"} />
                    </TableCell>
                    <TableCell>
                      {c.created_at ? (
                        <span className="tabular text-xs text-muted-foreground">
                          {new Date(c.created_at).toLocaleDateString()}
                        </span>
                      ) : (
                        <span className="text-muted-foreground text-xs">—</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <PaginationBar
            page={page}
            pageCount={pageCount}
            total={total}
            pageSize={pageSize}
            onPageChange={setPage}
            onPageSizeChange={setPageSize}
            itemLabel="campaigns"
          />
        </div>
      )}
    </div>
  );
}

/** Wrap in Suspense so useSearchParams (used by nuqs) doesn't break static generation. */
export default function CampaignsPage() {
  return (
    <React.Suspense fallback={<CampaignsTableSkeleton />}>
      <CampaignsContent />
    </React.Suspense>
  );
}
