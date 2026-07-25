"use client";

import * as React from "react";
import { ChevronRightIcon, ServerIcon, LayersIcon, BotIcon, PhoneIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * The seat → pool → pod → call model, shown once at the top of the admin VICIdial
 * pages so the hierarchy explains itself (the product's known weakness: operators
 * don't know how pods/pools/seats relate). `active` highlights the stage this page
 * manages. Infra vocabulary is fine here — this lives behind the admin wall.
 */
const STAGES = [
  { key: "seat", icon: BotIcon, label: "Bot seat", sub: "one call slot the client buys" },
  { key: "pool", icon: LayersIcon, label: "Pod pool", sub: "swappable group of pods" },
  { key: "pod", icon: ServerIcon, label: "GPU pod", sub: "the server running calls" },
  { key: "call", icon: PhoneIcon, label: "Call", sub: "bridged to a ready pod" },
] as const;

export function VicidialPipeline({ active }: { active?: "seat" | "pool" | "pod" | "call" }) {
  return (
    <div className="flex flex-wrap items-center gap-x-1 gap-y-2 rounded-lg border bg-muted/30 px-3 py-2.5">
      {STAGES.map((s, i) => {
        const on = s.key === active;
        return (
          <React.Fragment key={s.key}>
            <div className="flex items-center gap-2">
              <span className={cn(
                "flex size-7 shrink-0 items-center justify-center rounded-md border",
                on ? "border-primary/40 bg-primary/10 text-primary"
                   : "border-border bg-background text-muted-foreground")}>
                <s.icon className="size-3.5" aria-hidden />
              </span>
              <div className="leading-tight">
                <p className={cn("text-xs font-medium", on ? "text-foreground" : "text-foreground/90")}>
                  {s.label}
                </p>
                <p className="text-[11px] text-muted-foreground">{s.sub}</p>
              </div>
            </div>
            {i < STAGES.length - 1 && (
              <ChevronRightIcon className="hidden size-3.5 shrink-0 text-muted-foreground/60 sm:inline" aria-hidden />
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
}

/**
 * Live capacity meter for a pod's roster: sum of selected seats' concurrency vs the
 * pod cap. Shown ABOVE the picker so overflow is visible while choosing, not after
 * (P2). Text always pairs with the bar (never color-only).
 */
export function CapacityMeter({ used, cap }: { used: number; cap: number }) {
  // No cap set yet → don't fake a 0/0 bar; tell the admin to set one (it bounds the roster).
  if (!cap || cap <= 0) {
    return (
      <p className="text-xs text-muted-foreground">
        {used} call{used === 1 ? "" : "s"} selected · set a capacity to bound the roster
      </p>
    );
  }
  const over = used > cap;
  const pct = Math.min(100, Math.round((used / cap) * 100));
  const ratio = used / cap;
  const fill = over || ratio >= 1 ? "bg-destructive"
    : ratio >= 0.8 ? "bg-amber-400" : "bg-emerald-500";
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs">
        <span className="text-muted-foreground">Capacity</span>
        <span className={cn("tabular-nums", over ? "text-destructive" : "text-muted-foreground")}>
          {used}/{cap} call{used === 1 ? "" : "s"}
          {over ? " · over" : ` · ${cap - used} free`}
        </span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
        <div className={cn("h-full rounded-full transition-[width]", fill)}
          style={{ width: `${over ? 100 : pct}%` }} />
      </div>
    </div>
  );
}
