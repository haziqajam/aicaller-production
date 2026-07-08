"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { RotateCcwIcon } from "lucide-react";

/**
 * Manual refresh control — the no-polling replacement for `refetchInterval`.
 * Spins while a fetch is in flight and disables to prevent double-fires.
 */
export function RefreshButton({
  onRefresh, isFetching, className,
}: {
  onRefresh: () => void;
  isFetching: boolean;
  className?: string;
}) {
  return (
    <Button
      variant="outline"
      onClick={onRefresh}
      disabled={isFetching}
      className={className}
    >
      <RotateCcwIcon className={cn("size-4", isFetching && "animate-spin")} aria-hidden />
      {isFetching ? "Refreshing…" : "Refresh"}
    </Button>
  );
}

/**
 * Compact relative label for a past timestamp. Plain helper (not a hook), so the
 * `Date.now()` read is evaluated once when called — no timer, no render-purity
 * concern. Returns e.g. "Updated 12s ago".
 */
function fmtUpdated(at: number): string {
  const s = Math.max(0, Math.round((Date.now() - at) / 1000));
  if (s < 60) return `Updated ${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `Updated ${m}m ago`;
  const h = Math.round(m / 60);
  return `Updated ${h}h ago`;
}

/**
 * "Updated 12s ago" — computed AT RENDER ONLY (no interval/timer, per the
 * no-polling rule). The value refreshes whenever the page re-renders (e.g. on the
 * next Refresh). Renders nothing until the first refresh has happened.
 */
export function LastUpdatedLabel({
  at, className,
}: {
  at: number | null;
  className?: string;
}) {
  if (at == null) return null;
  return (
    <span className={cn("text-xs text-muted-foreground tabular-nums", className)}>
      {fmtUpdated(at)}
    </span>
  );
}
