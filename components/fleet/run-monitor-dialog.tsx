"use client";

import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { Fleet, type RunMonitor } from "@/lib/api/fleet";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { PodActions } from "@/components/fleet/pod-actions";
import { Loader2Icon, ExternalLinkIcon } from "lucide-react";

function fmtCost(n?: number) {
  return typeof n === "number" ? `$${n.toFixed(2)}` : "—";
}

/** Live monitor for a fleet run: lead funnel + pods + recent calls + cost (polled). */
export function RunMonitorDialog({
  runId, open, onOpenChange,
}: {
  runId: string | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const { data, isLoading } = useQuery<RunMonitor>({
    queryKey: ["fleet-run-monitor", runId],
    queryFn: () => Fleet.runMonitor(runId!),
    enabled: open && !!runId,
  });

  const f = data?.funnel;
  const pct = f && f.total ? Math.round((f.done / f.total) * 100) : 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            Run monitor
            {data && <Badge variant="secondary" className="capitalize">{data.status}</Badge>}
            {open && <Loader2Icon className="size-3.5 animate-spin text-muted-foreground" aria-hidden />}
          </DialogTitle>
          <DialogDescription className="font-mono text-xs">{runId}</DialogDescription>
        </DialogHeader>

        {isLoading || !data ? (
          <Skeleton className="h-48 w-full" />
        ) : (
          <div className="space-y-4">
            {/* Lead funnel */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>Lead funnel</span>
                <span className="tabular">{f!.done} / {f!.total} ({pct}%)</span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                <div className="h-full bg-primary transition-all" style={{ width: `${pct}%` }} />
              </div>
              <div className="flex flex-wrap gap-3 text-[11px] tabular">
                <span className="text-emerald-400">called {f!.called}</span>
                <span className="text-destructive">failed {f!.failed}</span>
                <span className="text-amber-400">in-flight {f!.locked}</span>
                <span className="text-muted-foreground">pending {f!.pending}</span>
                <span className="ml-auto text-muted-foreground">
                  burn {fmtCost(data.cost.burnPerHr)}/hr · spent {fmtCost(data.cost.spend)}
                </span>
              </div>
            </div>

            {/* Pods */}
            <div className="space-y-1.5">
              <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Pods ({data.pods.length})</p>
              {data.pods.length === 0 ? (
                <p className="text-xs text-muted-foreground">No pods.</p>
              ) : data.pods.map((p) => (
                <div key={p.id} className="flex items-center gap-2 rounded-md border border-border px-3 py-2 text-xs">
                  <span className="tabular text-muted-foreground">shard {p.shardIndex}</span>
                  <Badge variant={p.status === "running" ? "default" : p.status === "failed" ? "destructive" : "secondary"}
                    className="capitalize">{p.status}</Badge>
                  <span className="text-muted-foreground">{p.gpuType || p.provider || "—"}</span>
                  <span className="tabular text-muted-foreground">{fmtCost(p.costPerHr)}/hr</span>
                  {p.publicUrl && (
                    <a href={p.publicUrl} target="_blank" rel="noopener"
                      className="inline-flex items-center gap-1 text-primary underline underline-offset-2">
                      url <ExternalLinkIcon className="size-3" />
                    </a>
                  )}
                  {/* Logs · Pause/Resume · Destroy — admin can kill any pod here too,
                      including one still provisioning. */}
                  <span className="ml-auto">
                    <PodActions pod={p} compact invalidateKeys={[["fleet-run-monitor", runId]]} />
                  </span>
                </div>
              ))}
            </div>

            {/* Recent calls */}
            <div className="space-y-1.5">
              <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                Recent calls ({data.recentCalls.length})
              </p>
              {data.recentCalls.length === 0 ? (
                <p className="text-xs text-muted-foreground">No calls placed yet.</p>
              ) : (
                <div className="space-y-1">
                  {data.recentCalls.map((c) => (
                    <div key={c.callSid} className="flex items-center gap-3 text-[11px] tabular">
                      <span className="w-32 truncate text-foreground">{c.to}</span>
                      <span className="capitalize text-muted-foreground">{c.status}</span>
                      {c.durationSeconds != null && <span className="text-muted-foreground">{c.durationSeconds}s</span>}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
