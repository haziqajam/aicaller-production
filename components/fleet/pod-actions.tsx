"use client";

import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Fleet, type PodRecord } from "@/lib/api/fleet";
import { toastApiError } from "@/lib/api/errors";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  ScrollTextIcon, PauseIcon, PlayIcon, Trash2Icon, RotateCcwIcon, Loader2Icon,
} from "lucide-react";

// Query keys every pod mutation should refresh, so the change shows up across all the
// places a pod is listed (Infra table, inbound pool, routing registry).
const BASE_INVALIDATE: (readonly unknown[])[] = [
  ["fleet-pods"], ["fleet-inbound-pods"], ["fleet-inbound-registry"],
];

/**
 * Self-contained pod lifecycle controls: Logs · Pause/Resume · Destroy. Drop it next to
 * any PodRecord (Infra table, inbound pool card, run monitor) — it owns its own
 * mutations + logs dialog, so callers just pass the pod and any extra query keys to
 * refresh on success.
 *
 * DESTROY is available for ANY pod that isn't already terminated — including one still
 * `provisioning`, `failed`, or `missing`. The admin can always kill an instance; the
 * backend tolerates an already-gone instance and still cleans up the row + tunnel.
 */
export function PodActions({
  pod, invalidateKeys = [], compact = false,
}: {
  pod: PodRecord;
  invalidateKeys?: (readonly unknown[])[];
  compact?: boolean;
}) {
  const qc = useQueryClient();
  const [logsOpen, setLogsOpen] = React.useState(false);
  const size = compact ? "icon-xs" : "icon-sm";
  const icon = compact ? "size-3" : "size-3.5";

  const invalidate = () => {
    for (const k of [...BASE_INVALIDATE, ...invalidateKeys]) {
      qc.invalidateQueries({ queryKey: k as unknown[] });
    }
  };
  const terminate = useMutation({
    mutationFn: () => Fleet.terminatePod(pod.id),
    onSuccess: () => { toast.success("Pod destroyed"); invalidate(); },
    onError: (e) => toastApiError(e, "Couldn't destroy pod"),
  });
  const pause = useMutation({
    mutationFn: () => Fleet.pausePod(pod.id),
    onSuccess: () => { toast.success("Pod paused"); invalidate(); },
    onError: (e) => toastApiError(e, "Couldn't pause pod"),
  });
  const resume = useMutation({
    mutationFn: () => Fleet.resumePod(pod.id),
    onSuccess: () => { toast.success("Pod resumed"); invalidate(); },
    onError: (e) => toastApiError(e, "Couldn't resume pod"),
  });

  const busy = terminate.isPending || pause.isPending || resume.isPending;
  const canPause = ["running", "idle"].includes(pod.status);
  const canResume = pod.status === "paused";
  const canTerminate = pod.status !== "terminated";

  return (
    <span className="flex items-center gap-0.5">
      <Button variant="ghost" size={size} aria-label="View pod logs"
        className="text-muted-foreground hover:text-foreground"
        onClick={() => setLogsOpen(true)}>
        <ScrollTextIcon className={icon} />
      </Button>
      {canPause && (
        <Button variant="ghost" size={size} aria-label="Pause pod" disabled={busy}
          className="text-muted-foreground hover:text-foreground"
          onClick={() => pause.mutate()}>
          <PauseIcon className={icon} />
        </Button>
      )}
      {canResume && (
        <Button variant="ghost" size={size} aria-label="Resume pod" disabled={busy}
          className="text-emerald-400 hover:text-emerald-300"
          onClick={() => resume.mutate()}>
          <PlayIcon className={icon} />
        </Button>
      )}
      {canTerminate && (
        <AlertDialog>
          <AlertDialogTrigger render={
            <Button variant="ghost" size={size} aria-label="Destroy pod" disabled={busy}
              className="text-destructive transition-colors hover:bg-destructive/10 hover:text-destructive">
              {terminate.isPending
                ? <Loader2Icon className={cnSpin(icon)} />
                : <Trash2Icon className={icon} />}
            </Button>} />
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Destroy this pod?</AlertDialogTitle>
              <AlertDialogDescription>
                Destroys the pod&apos;s instance immediately — even if it&apos;s still
                provisioning — and tears down its Cloudflare tunnel. Any in-flight calls
                on it will drop. This can&apos;t be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={() => terminate.mutate()}
                disabled={terminate.isPending}
                className="bg-destructive text-white hover:bg-destructive/90">
                {terminate.isPending && <Loader2Icon className="size-4 animate-spin" />}
                {terminate.isPending ? "Destroying…" : "Destroy"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
      <PodLogsDialog pod={pod} open={logsOpen} onOpenChange={setLogsOpen} />
    </span>
  );
}

function cnSpin(size: string) {
  return `${size} animate-spin`;
}

/** Live pod-logs viewer. Fetches the provider's container logs on open; the Vast log API
 *  is async (request → poll S3), so the first load can take a few seconds. */
export function PodLogsDialog({
  pod, open, onOpenChange,
}: { pod: PodRecord | null; open: boolean; onOpenChange: (o: boolean) => void }) {
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
            <ScrollTextIcon className="size-4 text-primary" />
            Pod logs
            {pod && <span className="font-mono text-xs text-muted-foreground">
              {pod.providerId ?? pod.runpodId}
            </span>}
          </DialogTitle>
          <DialogDescription>
            Container logs pulled from the provider (Vast.ai). Useful when a pod has no
            URL or its calls are failing.
          </DialogDescription>
        </DialogHeader>
        <div className="flex items-center gap-3 text-sm">
          <label className="flex items-center gap-2 text-muted-foreground">
            <Switch checked={daemon} onCheckedChange={setDaemon} />
            Daemon / system logs
          </label>
          <Button variant="outline" size="sm" className="ml-auto"
            disabled={logsQ.isFetching}
            onClick={() => logsQ.refetch()}>
            <RotateCcwIcon className="size-3.5" />
            {logsQ.isFetching ? "Loading…" : "Refresh"}
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
