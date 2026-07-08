"use client";

import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { Calls, Leads, type Paginated } from "@/lib/api/resources";
import { StatusChip } from "@/components/status-chip";
import { CallConversation } from "@/components/calls/call-conversation";
import {
  formatDuration,
  type CallRecord,
} from "@/components/calls/columns";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { PhoneOffIcon, AudioLinesIcon, UserIcon } from "lucide-react";

// Rail page size — we fetch this many calls at a time and grow via "Load more"
// rather than loading every call for the campaign.
const PAGE_SIZE = 50;

const TERMINAL = new Set([
  "completed",
  "busy",
  "no-answer",
  "failed",
  "canceled",
]);

type Lead = { id?: string; name?: string; phone?: string };

function leadLabel(call: CallRecord, leads: Map<string, Lead>): string {
  const lead = call.leadId ? leads.get(call.leadId) : undefined;
  return lead?.name?.trim() || lead?.phone || call.to || "Unknown lead";
}

function relTime(iso?: string): string {
  if (!iso) return "";
  try {
    const diff = Date.now() - new Date(iso).getTime();
    const m = Math.floor(diff / 60000);
    if (m < 1) return "just now";
    if (m < 60) return `${m}m ago`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h ago`;
    return new Date(iso).toLocaleDateString();
  } catch {
    return "";
  }
}

/* ─── one row in the calls rail ──────────────────────────────── */

function CallRow({
  call,
  label,
  selected,
  onSelect,
}: {
  call: CallRecord;
  label: string;
  selected: boolean;
  onSelect: () => void;
}) {
  const live = call.status ? !TERMINAL.has(call.status) : false;
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        "flex w-full flex-col gap-1 border-b border-border px-3 py-2.5 text-left transition-colors last:border-b-0",
        selected ? "bg-primary/5" : "hover:bg-muted/40"
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="flex min-w-0 items-center gap-1.5 text-sm font-medium text-foreground">
          <UserIcon className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
          <span className="truncate">{label}</span>
        </span>
        <StatusChip status={call.status ?? "—"} />
      </div>
      <div className="flex items-center justify-between gap-2 pl-5 text-[11px] text-muted-foreground">
        <span className="tabular truncate">{call.to ?? ""}</span>
        <span className="flex shrink-0 items-center gap-2">
          {call.recording && (
            <AudioLinesIcon className="size-3 text-muted-foreground" aria-hidden />
          )}
          {!live && (
            <span className="tabular">{formatDuration(call.durationSeconds)}</span>
          )}
          <span>{relTime(call.requestedAt)}</span>
        </span>
      </div>
      {call.twilioErrorCode && (
        <span className="pl-5 text-[10px] text-destructive">
          Twilio {call.twilioErrorCode}
        </span>
      )}
    </button>
  );
}

/* ─── main results ───────────────────────────────────────────── */

export function CampaignResults({
  campaignId,
  isRunning,
}: {
  campaignId: string;
  isRunning: boolean;
}) {
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  // How many calls the rail shows; grows via "Load more" rather than loading
  // every call for the campaign up front.
  const [limit, setLimit] = React.useState(PAGE_SIZE);

  // Polling removed — the campaign view fetches calls once (no live transcript
  // re-fetch loop that contended with the voice pipeline). Reload the page to
  // pull the latest calls + recordings. Server-paginated: fetch the first
  // `limit` calls (newest first), not the whole history.
  const { data: page, isLoading } = useQuery<Paginated<CallRecord>>({
    queryKey: ["calls", "campaign", campaignId, limit],
    queryFn: () => Calls.list({ campaignId, skip: 0, limit }),
    placeholderData: (prev) => prev,
  });
  const calls = page?.items;
  const total = page?.total ?? 0;

  const { data: leadsRaw } = useQuery<Lead[]>({
    queryKey: ["leads"],
    queryFn: Leads.list,
  });

  const leads = React.useMemo(() => {
    const m = new Map<string, Lead>();
    for (const l of leadsRaw ?? []) if (l.id) m.set(l.id, l);
    return m;
  }, [leadsRaw]);

  // Newest-first ordering for the rail.
  const ordered = React.useMemo(
    () =>
      (calls ?? [])
        .slice()
        .sort((a, b) =>
          (b.requestedAt ?? "").localeCompare(a.requestedAt ?? "")
        ),
    [calls]
  );

  if (isLoading && !calls) {
    return <Skeleton className="h-full min-h-[20rem] w-full rounded-lg" />;
  }

  if (ordered.length === 0) {
    return (
      <div className="flex h-full min-h-[20rem] flex-col items-center justify-center gap-2 rounded-lg border border-border py-12 text-center">
        <PhoneOffIcon className="size-5 text-muted-foreground" aria-hidden />
        <p className="text-sm text-muted-foreground">
          {isRunning
            ? "Calls are being placed — conversations will appear here as they connect."
            : "No calls have been placed for this campaign yet."}
        </p>
      </div>
    );
  }

  const selected = ordered.find((c) => c.id === selectedId) ?? ordered[0];

  const conversation = (
    <CallConversation
      key={selected.id}
      messages={selected.messages ?? []}
      status={selected.status}
      recording={selected.recording ?? undefined}
      height="fill"
      getRecordingUrl={
        selected.id
          ? () => Calls.recording(selected.id!).then((r) => r.url)
          : undefined
      }
    />
  );

  // Single call → just the conversation inline (no rail needed).
  if (ordered.length === 1) {
    return (
      <div className="flex flex-col gap-2 lg:h-full lg:min-h-0">
        <div className="flex shrink-0 items-center justify-between gap-2">
          <span className="flex items-center gap-1.5 text-sm font-medium text-foreground">
            <UserIcon className="size-3.5 text-muted-foreground" aria-hidden />
            {leadLabel(selected, leads)}
          </span>
          <StatusChip status={selected.status ?? "—"} />
        </div>
        {conversation}
      </div>
    );
  }

  // Multiple calls → master-detail (rail + conversation), stacks on mobile.
  return (
    <div className="grid gap-3 lg:h-full lg:min-h-0 lg:grid-cols-[minmax(15rem,20rem)_1fr]">
      <div className="flex max-h-[40vh] flex-col overflow-hidden rounded-lg border border-border lg:max-h-none lg:h-full lg:min-h-0">
        <div className="flex shrink-0 items-center justify-between border-b border-border bg-muted/30 px-3 py-2">
          <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            Calls
          </span>
          <span className="tabular text-[10px] text-muted-foreground">
            {total > ordered.length ? `${ordered.length} of ${total}` : ordered.length}
          </span>
        </div>
        <ScrollArea className="min-h-0 flex-1">
          {ordered.map((c) => (
            <CallRow
              key={c.id}
              call={c}
              label={leadLabel(c, leads)}
              selected={c.id === selected.id}
              onSelect={() => setSelectedId(c.id ?? null)}
            />
          ))}
          {ordered.length < total && (
            <div className="border-t border-border p-2">
              <button
                type="button"
                onClick={() => setLimit((n) => n + PAGE_SIZE)}
                className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-muted/50"
              >
                Load more ({total - ordered.length} more)
              </button>
            </div>
          )}
        </ScrollArea>
      </div>

      <div className="flex min-w-0 flex-col gap-2 lg:h-full lg:min-h-0">
        <div className="flex shrink-0 items-center justify-between gap-2">
          <span className="flex min-w-0 items-center gap-1.5 text-sm font-medium text-foreground">
            <UserIcon className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
            <span className="truncate">{leadLabel(selected, leads)}</span>
            <span className="tabular text-xs text-muted-foreground">
              {selected.to}
            </span>
          </span>
          <StatusChip status={selected.status ?? "—"} />
        </div>
        {conversation}
      </div>
    </div>
  );
}
