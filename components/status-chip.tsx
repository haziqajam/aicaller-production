"use client";

import { cn } from "@/lib/utils";

/**
 * Canonical status strings understood by this app.
 * Add new strings here as needed — keep the mapping exhaustive.
 */
export type CallStatus =
  | "answered"
  | "completed"
  | "in-progress"
  | "in_progress"
  | "ringing"
  | "initiated"
  | "queued"
  | "voicemail"
  | "left-voicemail"
  | "failed"
  | "busy"
  | "canceled"
  | "no-answer"
  | "no_answer"
  | "noanswer"
  | "running"
  | "active"
  | "stopped"
  | "paused"
  | "draft"
  | "idle"
  | string; // allow unknown pass-throughs

type Semantic = "success" | "warning" | "destructive" | "primary" | "muted" | "idle";

interface StatusStyle {
  semantic: Semantic;
  label: string;
  glow?: boolean;
}

function resolveStatus(status: string): StatusStyle {
  const s = (status ?? "").toLowerCase().trim();

  switch (s) {
    // ── success ─────────────────────────────────────────────────────
    case "answered":
    case "completed":
      return { semantic: "success", label: s === "completed" ? "completed" : "answered" };
    case "in-progress":
    case "in_progress":
      return { semantic: "success", label: "in progress" };

    // ── warning ──────────────────────────────────────────────────────
    case "ringing":
      return { semantic: "warning", label: "ringing" };
    case "initiated":
      return { semantic: "warning", label: "initiated" };
    case "queued":
      return { semantic: "warning", label: "queued" };
    case "voicemail":
    case "left-voicemail":
      return { semantic: "warning", label: "voicemail" };

    // ── destructive ──────────────────────────────────────────────────
    case "failed":
      return { semantic: "destructive", label: "failed" };
    case "busy":
      return { semantic: "destructive", label: "busy" };
    case "canceled":
      return { semantic: "destructive", label: "canceled" };

    // ── idle (no-answer) ─────────────────────────────────────────────
    case "no-answer":
    case "no_answer":
    case "noanswer":
      return { semantic: "idle", label: "no answer" };

    // ── primary / running ────────────────────────────────────────────
    case "running":
    case "active":
      return { semantic: "primary", label: s, glow: true };

    // ── muted ────────────────────────────────────────────────────────
    case "stopped":
    case "paused":
      return { semantic: "muted", label: s };

    // ── idle / draft ─────────────────────────────────────────────────
    case "draft":
    case "idle":
      return { semantic: "idle", label: s };

    default:
      return { semantic: "muted", label: status || "—" };
  }
}

/** CSS classes per semantic bucket */
const SEMANTIC_CLASSES: Record<Semantic, { dot: string; chip: string }> = {
  success: {
    dot: "bg-success",
    chip: "bg-success/12 text-success border-success/25",
  },
  warning: {
    dot: "bg-warning",
    chip: "bg-warning/12 text-warning border-warning/25",
  },
  destructive: {
    dot: "bg-destructive",
    chip: "bg-destructive/12 text-destructive border-destructive/25",
  },
  primary: {
    dot: "bg-primary",
    chip: "bg-primary/12 text-primary border-primary/25",
  },
  muted: {
    dot: "bg-muted-foreground/50",
    chip: "bg-muted text-muted-foreground border-border",
  },
  idle: {
    dot: "bg-idle",
    chip: "bg-idle/10 text-idle border-idle/20",
  },
};

/**
 * Returns the Tailwind class string for the semantic color of a given status.
 * Useful when you need only the color (e.g., for a custom badge).
 */
export function statusColor(status: string): { dot: string; chip: string } {
  const { semantic } = resolveStatus(status);
  return SEMANTIC_CLASSES[semantic];
}

interface StatusChipProps {
  status: string;
  className?: string;
}

/**
 * Single source of truth for rendering call/campaign status as a
 * compact chip with a leading dot.
 *
 * Usage:
 *   <StatusChip status="running" />
 *   <StatusChip status="answered" />
 */
export function StatusChip({ status, className }: StatusChipProps) {
  const { semantic, label, glow } = resolveStatus(status);
  const styles = SEMANTIC_CLASSES[semantic];

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5",
        "text-[11px] font-medium capitalize tabular",
        "transition-colors duration-150",
        styles.chip,
        glow && "glow-primary",
        className
      )}
    >
      <span
        className={cn(
          "size-1.5 shrink-0 rounded-full",
          styles.dot,
          /* running gets a pulse */
          semantic === "primary" && "animate-pulse"
        )}
        aria-hidden
      />
      {label}
    </span>
  );
}
