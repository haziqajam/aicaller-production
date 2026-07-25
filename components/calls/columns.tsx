"use client";

import { type ColumnDef } from "@tanstack/react-table";
import { StatusChip } from "@/components/status-chip";
import { BotIcon } from "lucide-react";

/* ─── Real call-document shape (mirrors caller/db.py) ─────────── */

export type CallMessage = {
  role?: string;
  text?: string;
  source?: string;
  at?: string;
};
export type CallProviders = { stt?: string; tts?: string; llm?: string };
export type CallRecording = {
  bucket?: string;
  objectKey?: string;
  durationMs?: number;
  format?: string;
} | null;

export type CallRecord = {
  id?: string;
  callSid?: string;
  direction?: string;
  from?: string;
  to?: string;
  assistantId?: string | null;
  /** Resolved client-side from the assistants list. */
  assistantName?: string | null;
  campaignId?: string | null;
  leadId?: string | null;
  status?: string;
  hangupCause?: string | null;
  twilioErrorCode?: string | null;
  requestedAt?: string;
  connectedAt?: string | null;
  endedAt?: string | null;
  durationSeconds?: number | null;
  messages?: CallMessage[];
  providers?: CallProviders;
  recording?: CallRecording;
  transfer?: Record<string, unknown> | null;
  cost?: Record<string, unknown>;
  usage?: Record<string, unknown>;
  callOutcome?: string;
};

export function formatDuration(seconds: number | null | undefined): string {
  if (seconds == null) return "—";
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return m > 0 ? `${m}m ${s.toString().padStart(2, "0")}s` : `${s}s`;
}

export const callsColumns: ColumnDef<CallRecord>[] = [
  {
    accessorKey: "requestedAt",
    header: "Date",
    cell: ({ getValue }) => {
      const v = getValue() as string | undefined;
      if (!v) return <span className="text-muted-foreground text-xs">—</span>;
      try {
        const d = new Date(v);
        return (
          <span className="tabular whitespace-nowrap text-xs text-muted-foreground">
            {d.toLocaleDateString()}{" "}
            <span className="text-muted-foreground/70">
              {d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
            </span>
          </span>
        );
      } catch {
        return <span className="text-muted-foreground text-xs">—</span>;
      }
    },
  },
  {
    accessorKey: "from",
    header: "From",
    cell: ({ getValue }) => (
      <span className="tabular text-xs text-foreground">
        {(getValue() as string) || "—"}
      </span>
    ),
  },
  {
    accessorKey: "to",
    header: "To",
    cell: ({ getValue }) => (
      <span className="tabular text-xs text-foreground">
        {(getValue() as string) || "—"}
      </span>
    ),
  },
  {
    id: "assistant",
    accessorFn: (row) => row.assistantName ?? row.assistantId ?? "",
    header: "Assistant",
    cell: ({ row }) => {
      const name = row.original.assistantName;
      const id = row.original.assistantId;
      if (!name && !id)
        return <span className="text-muted-foreground text-xs">—</span>;
      return (
        <span className="inline-flex items-center gap-1.5 text-xs text-foreground">
          <BotIcon className="size-3 text-muted-foreground" aria-hidden />
          <span className="truncate max-w-[10rem]">
            {name ?? `${id!.slice(0, 8)}…`}
          </span>
        </span>
      );
    },
  },
  {
    accessorKey: "durationSeconds",
    header: "Duration",
    cell: ({ getValue }) => (
      <span className="tabular whitespace-nowrap text-xs text-foreground">
        {formatDuration(getValue() as number | null | undefined)}
      </span>
    ),
  },
  {
    accessorKey: "status",
    header: "Outcome",
    cell: ({ getValue }) => <StatusChip status={(getValue() as string) ?? "—"} />,
    filterFn: (row, columnId, filterValue) => {
      if (!filterValue) return true;
      const val = (row.getValue(columnId) as string) ?? "";
      return val.toLowerCase() === filterValue.toLowerCase();
    },
  },
  {
    accessorKey: "callOutcome",
    header: "Result",
    cell: ({ getValue }) => {
      const v = getValue() as string | undefined;
      return v ? <StatusChip status={v} /> : <span className="text-muted-foreground">—</span>;
    },
  },
];
