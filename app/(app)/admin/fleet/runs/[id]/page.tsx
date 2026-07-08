"use client";

import * as React from "react";
import { use } from "react";
import Link from "next/link";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Fleet, type PodRecord, type RunMonitor, type FleetRunDetail } from "@/lib/api/fleet";
import { toastApiError } from "@/lib/api/errors";
import { getRole } from "@/lib/auth";
import { PodStatusBadge } from "@/components/fleet/pod-status-badge";
import { RefreshButton, LastUpdatedLabel } from "@/components/fleet/refresh-button";
import { ReupButton } from "@/components/fleet/inbound-tab";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  ArrowLeftIcon, PlayIcon, PauseIcon, Trash2Icon, RotateCcwIcon, ScrollTextIcon,
  ExternalLinkIcon, CopyIcon, ServerIcon, UsersIcon, WalletIcon,
} from "lucide-react";

function fmtCost(n?: number) {
  return typeof n === "number" ? `$${n.toFixed(2)}` : "—";
}

export default function FleetDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  // Hydration-safe admin gate (mirrors the main fleet page).
  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => setMounted(true), []);
  if (!mounted) return <div className="h-64 animate-pulse rounded-lg bg-muted/40" />;
  if (getRole() !== "admin") {
    return (
      <div className="rounded-lg border border-border bg-muted/20 px-4 py-10 text-center text-sm text-muted-foreground">
        Not authorized — admins only.
      </div>
    );
  }
  return <FleetDetail id={id} />;
}

function FleetDetail({ id }: { id: string }) {
  const qc = useQueryClient();
  const [logsPod, setLogsPod] = React.useState<PodRecord | null>(null);
  const [lastUpdated, setLastUpdated] = React.useState<number | null>(null);
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["fleet-monitor", id] });
    qc.invalidateQueries({ queryKey: ["fleet-run-detail", id] });
  };

  const monitor = useQuery<RunMonitor>({
    queryKey: ["fleet-monitor", id],
    queryFn: () => Fleet.runMonitor(id),
  });
  const detail = useQuery<FleetRunDetail>({
    queryKey: ["fleet-run-detail", id],
    queryFn: () => Fleet.runDetail(id),
  });

  // Manual refresh: reconcile silent-pod removal, then invalidate this run's two
  // detail queries. Replaces the old polling.
  const reconcileMut = useMutation({ mutationFn: Fleet.reconcile });
  const refreshAll = async () => {
    await reconcileMut.mutateAsync().catch(() => {});
    invalidate();
    setLastUpdated(Date.now());
  };
  const anyFetching = monitor.isFetching || detail.isFetching || reconcileMut.isPending;

  const m = monitor.data;
  const d = detail.data;
  const pods = m?.pods ?? [];
  const funnel = m?.funnel;
  const status = m?.status ?? d?.status ?? "—";
  const dialing = d?.dialingEnabled ?? true;
  const waiting = !dialing && !["completed", "terminated"].includes(status);
  const label = d?.campaign?.assistantName || "Campaign fleet";
  const funnelPct = funnel && funnel.total ? Math.round((funnel.done / funnel.total) * 100) : 0;

  // ── fleet-level mutations ──
  const start = useMutation({ mutationFn: () => Fleet.startRun(id),
    onSuccess: () => { toast.success("Dialing started"); invalidate(); }, onError: (e) => toastApiError(e) });
  const pause = useMutation({ mutationFn: () => Fleet.pauseRun(id),
    onSuccess: (r) => { toast.success(`Paused ${r.paused} pod(s)`); invalidate(); }, onError: (e) => toastApiError(e) });
  const resume = useMutation({ mutationFn: () => Fleet.resumeRun(id),
    onSuccess: (r) => { toast.success(`Resumed ${r.resumed} pod(s)`); invalidate(); }, onError: (e) => toastApiError(e) });
  const redial = useMutation({ mutationFn: () => Fleet.redialRun(id),
    onSuccess: (r) => {
      if (r.ok) toast.success("Re-dialing on a live pod");
      else toast.warning(`Redial → ${r.status}`);
      invalidate();
    },
    onError: (e) => toastApiError(e) });
  const destroy = useMutation({ mutationFn: () => Fleet.destroyRun(id),
    onSuccess: (r) => { toast.success(`Destroyed ${r.destroyed} pod(s)`); invalidate(); }, onError: (e) => toastApiError(e) });
  const setAutoDestroy = useMutation({
    mutationFn: (v: boolean) => Fleet.approveRun(id, { autoDestroy: v }),
    onSuccess: () => { toast.success("Updated"); invalidate(); }, onError: (e) => toastApiError(e) });
  const busy = start.isPending || pause.isPending || resume.isPending || redial.isPending || destroy.isPending;
  const isPaused = status === "paused";

  return (
    <div className="space-y-5">
      <Link href="/admin/fleet"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeftIcon className="size-4" /> Fleet
      </Link>

      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="flex items-center gap-2 text-base font-semibold text-foreground">
            <ServerIcon className="size-4 text-primary" /> {label}
          </h1>
          <p className="mt-0.5 font-mono text-xs text-muted-foreground">{m?.campaignId ?? d?.campaignId}</p>
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            <Badge variant={status === "running" ? "default" : "secondary"} className="capitalize">{status}</Badge>
            {d?.ownerEmail && <span className="text-xs text-muted-foreground">{d.ownerEmail}</span>}
            <Badge variant={d?.autoStart ? "secondary" : "outline"} className="text-[10px]">
              {d?.autoStart ? "auto-start" : "manual start"}
            </Badge>
          </div>
        </div>

        {/* Fleet controls */}
        <div className="flex flex-wrap items-center gap-2">
          <LastUpdatedLabel at={lastUpdated} />
          <RefreshButton onRefresh={refreshAll} isFetching={anyFetching} />
          {waiting && (
            <Button size="sm" onClick={() => start.mutate()} disabled={busy}>
              <PlayIcon className="size-3.5" /> Start calling
            </Button>
          )}
          {isPaused ? (
            <Button size="sm" variant="outline" onClick={() => resume.mutate()} disabled={busy}>
              <PlayIcon className="size-3.5" /> Resume
            </Button>
          ) : (
            <Button size="sm" variant="outline" onClick={() => pause.mutate()} disabled={busy}>
              <PauseIcon className="size-3.5" /> Pause
            </Button>
          )}
          <Button size="sm" variant="outline" onClick={() => redial.mutate()} disabled={busy}>
            <RotateCcwIcon className="size-3.5" /> Re-dial
          </Button>
          <AlertDialog>
            <AlertDialogTrigger render={
              <Button size="sm" variant="ghost"
                className="text-destructive hover:bg-destructive/10 hover:text-destructive">
                <Trash2Icon className="size-3.5" /> Destroy
              </Button>} />
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Destroy this fleet?</AlertDialogTitle>
                <AlertDialogDescription>
                  Tears down all {pods.length} pod(s) and their Cloudflare tunnels immediately.
                  In-flight calls drop. This cannot be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={() => destroy.mutate()}
                  disabled={destroy.isPending}
                  className="bg-destructive text-white hover:bg-destructive/90">
                  {destroy.isPending ? "Destroying…" : "Destroy"}</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>

      {/* Funnel + cost */}
      <Card>
        <CardContent className="space-y-3 p-4">
          {!funnel ? <Skeleton className="h-12" /> : (
            <>
              <div className="flex items-center justify-between text-sm">
                <span className="flex items-center gap-1.5 font-medium">
                  <UsersIcon className="size-4 text-muted-foreground" />
                  {funnel.done.toLocaleString()} / {funnel.total.toLocaleString()} done
                </span>
                <span className="flex items-center gap-1.5 text-muted-foreground">
                  <WalletIcon className="size-4" /> {fmtCost(m?.cost.spend)} · {fmtCost(m?.cost.burnPerHr)}/hr
                </span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${funnelPct}%` }} />
              </div>
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground tabular-nums">
                <span>{funnel.called} called</span>
                <span className="text-destructive">{funnel.failed} failed</span>
                <span>{funnel.locked} in-flight</span>
                <span>{funnel.pending} pending</span>
              </div>
            </>
          )}
          <label className="flex items-center justify-between gap-3 border-t border-border pt-3">
            <span className="text-sm">
              <span className="font-medium">Auto-destroy when finished</span>
              <span className="ml-2 text-xs text-muted-foreground">
                {d?.autoDestroy ? "pods reap on drain" : "pods stay up after draining"}
              </span>
            </span>
            <Switch checked={d?.autoDestroy ?? true}
              onCheckedChange={(v) => setAutoDestroy.mutate(v)}
              disabled={setAutoDestroy.isPending || !d} />
          </label>
        </CardContent>
      </Card>

      {/* Pods */}
      <Card>
        <CardContent className="p-0">
          {monitor.isLoading && pods.length === 0 ? (
            <Skeleton className="m-4 h-9" />
          ) : pods.length === 0 ? (
            <div className="px-4 py-10 text-center text-sm text-muted-foreground">
              No pods for this fleet.
            </div>
          ) : (
            <Table>
              <TableHeader><TableRow>
                <TableHead>Shard</TableHead><TableHead>Instance</TableHead><TableHead>Public URL</TableHead>
                <TableHead>GPU</TableHead><TableHead>Status</TableHead>
                <TableHead>Cost/hr</TableHead><TableHead>Spent</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {pods.map((p) => (
                  <PodRow key={p.id} pod={p} onLogs={() => setLogsPod(p)} onChanged={invalidate} />
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Recent calls */}
      {m && m.recentCalls.length > 0 && (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader><TableRow>
                <TableHead>To</TableHead><TableHead>Status</TableHead>
                <TableHead>Duration</TableHead><TableHead>Ended</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {m.recentCalls.map((c) => (
                  <TableRow key={c.callSid}>
                    <TableCell className="tabular text-xs">{c.to}</TableCell>
                    <TableCell className="text-xs capitalize text-muted-foreground">{c.status}</TableCell>
                    <TableCell className="tabular text-xs">{c.durationSeconds != null ? `${c.durationSeconds}s` : "—"}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {c.endedAt ? new Date(c.endedAt).toLocaleTimeString() : "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      <PodLogsDialog pod={logsPod} open={logsPod !== null}
        onOpenChange={(o) => { if (!o) setLogsPod(null); }} />
    </div>
  );
}

/** One pod row with per-pod pause / resume / terminate / logs. */
function PodRow({ pod, onLogs, onChanged }: { pod: PodRecord; onLogs: () => void; onChanged: () => void }) {
  const pause = useMutation({ mutationFn: () => Fleet.pausePod(pod.id),
    onSuccess: () => { toast.success("Pod paused"); onChanged(); }, onError: (e) => toastApiError(e) });
  const resume = useMutation({ mutationFn: () => Fleet.resumePod(pod.id),
    onSuccess: () => { toast.success("Pod resumed"); onChanged(); }, onError: (e) => toastApiError(e) });
  const terminate = useMutation({ mutationFn: () => Fleet.terminatePod(pod.id),
    onSuccess: () => { toast.success("Pod terminated"); onChanged(); }, onError: (e) => toastApiError(e) });
  const busy = pause.isPending || resume.isPending || terminate.isPending;
  const canPause = ["running", "idle"].includes(pod.status);
  const canResume = pod.status === "paused";
  const canTerminate = !["terminated", "failed", "missing", "deprecated"].includes(pod.status);
  const canReup = pod.status === "missing" || pod.status === "deprecated";
  const instance = pod.providerId ?? pod.runpodId;

  return (
    <TableRow>
      <TableCell className="tabular text-xs">{pod.shardIndex}</TableCell>
      <TableCell className="font-mono text-xs">
        <span className="block max-w-[140px] truncate" title={instance}>{instance}</span>
      </TableCell>
      <TableCell>
        {pod.publicUrl ? (
          <span className="inline-flex max-w-[220px] items-center gap-1.5 font-mono text-xs">
            <a href={pod.publicUrl} target="_blank" rel="noopener" title={pod.publicUrl}
              className="inline-flex min-w-0 items-center gap-1 text-primary underline underline-offset-2">
              <span className="truncate">{pod.publicUrl.replace(/^https?:\/\//, "")}</span>
              <ExternalLinkIcon className="size-3 shrink-0" />
            </a>
            <button type="button" aria-label="Copy URL"
              className="shrink-0 text-muted-foreground hover:text-foreground"
              onClick={() => { navigator.clipboard?.writeText(pod.publicUrl!); toast.success("URL copied"); }}>
              <CopyIcon className="size-3" />
            </button>
          </span>
        ) : (
          <span className="text-xs text-muted-foreground">
            {["terminated", "failed"].includes(pod.status) ? "—" : "provisioning…"}
          </span>
        )}
      </TableCell>
      <TableCell className="text-xs"><span className="block max-w-[120px] truncate" title={pod.gpuType}>{pod.gpuType}</span></TableCell>
      <TableCell><PodStatusBadge status={pod.status} /></TableCell>
      <TableCell className="tabular">{fmtCost(pod.costPerHr)}</TableCell>
      <TableCell className="tabular">{fmtCost(pod.accumulatedCost)}</TableCell>
      <TableCell className="text-right">
        <div className="flex items-center justify-end gap-0.5">
          <Button variant="ghost" size="icon" aria-label="Logs"
            className="text-muted-foreground hover:text-foreground" onClick={onLogs}>
            <ScrollTextIcon className="size-4" />
          </Button>
          {canReup && <ReupButton pod={pod} />}
          {canPause && (
            <Button variant="ghost" size="icon" aria-label="Pause pod" disabled={busy}
              className="text-muted-foreground hover:text-foreground" onClick={() => pause.mutate()}>
              <PauseIcon className="size-4" />
            </Button>
          )}
          {canResume && (
            <Button variant="ghost" size="icon" aria-label="Resume pod" disabled={busy}
              className="text-emerald-400 hover:text-emerald-300" onClick={() => resume.mutate()}>
              <PlayIcon className="size-4" />
            </Button>
          )}
          {canTerminate && (
            <AlertDialog>
              <AlertDialogTrigger render={
                <Button variant="ghost" size="icon" aria-label="Terminate pod"
                  className="text-destructive hover:bg-destructive/10 hover:text-destructive">
                  <Trash2Icon className="size-4" />
                </Button>} />
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Terminate this pod?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Destroys the instance + its Cloudflare tunnel immediately. In-flight calls drop.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={() => terminate.mutate()}
                    disabled={terminate.isPending}
                    className="bg-destructive text-white hover:bg-destructive/90">
                    {terminate.isPending ? "Terminating…" : "Terminate"}</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
        </div>
      </TableCell>
    </TableRow>
  );
}

/** Live pod-logs viewer (Vast logs are async: request → poll S3, can take seconds). */
function PodLogsDialog({ pod, open, onOpenChange }: {
  pod: PodRecord | null; open: boolean; onOpenChange: (o: boolean) => void;
}) {
  const [daemon, setDaemon] = React.useState(false);
  const podId = pod?.id ?? null;
  const logsQ = useQuery({
    queryKey: ["pod-logs", podId, daemon],
    queryFn: () => Fleet.podLogs(podId!, { tail: 2000, daemon }),
    enabled: open && podId !== null,
    refetchOnWindowFocus: false,
    retry: false,
  });
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ScrollTextIcon className="size-4 text-primary" /> Pod logs
            {pod && <span className="font-mono text-xs text-muted-foreground">{pod.providerId ?? pod.runpodId}</span>}
          </DialogTitle>
          <DialogDescription>Container logs pulled from the provider (Vast.ai).</DialogDescription>
        </DialogHeader>
        <div className="flex items-center gap-3 text-sm">
          <label className="flex items-center gap-2 text-muted-foreground">
            <Switch checked={daemon} onCheckedChange={setDaemon} /> Daemon / system logs
          </label>
          <Button variant="outline" size="sm" className="ml-auto"
            disabled={logsQ.isFetching} onClick={() => logsQ.refetch()}>
            <RotateCcwIcon className="size-3.5" />{logsQ.isFetching ? "Loading…" : "Refresh"}
          </Button>
        </div>
        <pre className="max-h-[55vh] overflow-auto rounded-md border bg-muted/30 p-3 text-xs leading-relaxed whitespace-pre-wrap break-words">
          {logsQ.isFetching && !logsQ.data
            ? "Fetching logs… (Vast uploads them on request, this can take a few seconds)"
            : logsQ.isError
              ? `Failed to load logs: ${(logsQ.error as Error)?.message ?? "unknown error"}`
              : (logsQ.data?.logs?.trim() || "No logs returned.")}
        </pre>
      </DialogContent>
    </Dialog>
  );
}
