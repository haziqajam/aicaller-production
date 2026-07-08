"use client";

import * as React from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { Fleet, type FleetRun } from "@/lib/api/fleet";
import { toastApiError } from "@/lib/api/errors";
import { GPU_OPTIONS, GPU_ITEMS, DEFAULT_GPU } from "@/components/fleet/gpu-options";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  BotIcon, PhoneOutgoingIcon, UsersIcon, GaugeIcon, ClockIcon, TimerIcon,
  ActivityIcon, MailIcon, CpuIcon, RocketIcon, type LucideIcon,
} from "lucide-react";

function fmtCost(n?: number) {
  return typeof n === "number" ? `$${n.toFixed(2)}` : "—";
}

/** Labelled config cell mirroring the campaign detail page's ConfigItem. */
function ConfigItem({
  icon: Icon, label, value,
}: { icon: LucideIcon; label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2.5 rounded-lg border border-border bg-muted/20 px-3 py-2.5">
      <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
        <Icon className="size-3.5" aria-hidden />
      </span>
      <div className="min-w-0">
        <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">{label}</p>
        <p className="mt-0.5 truncate text-sm font-medium text-foreground">{value}</p>
      </div>
    </div>
  );
}

/**
 * Review & Deploy dialog for a single pending run.
 *
 * Always-mounted controlled dialog (Base UI dialogs left conditionally unmounted
 * make the page inert). Shows campaign details + a leads preview from
 * Fleet.runDetail, the sizing recommendation, and the deploy form (Fleet.approveRun)
 * where the admin sizes the fleet, plus a Reject action (Fleet.rejectRun).
 */
export function ReviewRunDialog({
  run, open, onOpenChange, onChanged,
}: {
  run: FleetRun | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onChanged: () => void;
}) {
  const runId = run?.id ?? null;

  // Deploy-form state (seeded from the run; the admin sizes the fleet here).
  const [chosenPods, setChosenPods] = React.useState(1);
  const [gpuType, setGpuType] = React.useState<string | null>(DEFAULT_GPU);
  const [concurrencyPerPod, setConcurrency] = React.useState(5);
  const [autoStart, setAutoStart] = React.useState(true);
  const [autoDestroy, setAutoDestroy] = React.useState(true);

  // Reset the form each time a different run opens.
  React.useEffect(() => {
    if (open && run) {
      setChosenPods(Math.max(1, run.chosenPods ?? run.recommendedPods ?? 1));
      setGpuType(run.gpuType ?? DEFAULT_GPU);
      setConcurrency(Math.max(1, run.concurrencyPerPod ?? 5));
      setAutoStart(run.autoStart ?? true);
      setAutoDestroy(run.autoDestroy ?? true);
    }
  }, [open, run]);

  const detail = useQuery({
    queryKey: ["fleet-run-detail", runId],
    queryFn: () => Fleet.runDetail(runId as string),
    enabled: open && Boolean(runId),
  });

  const approve = useMutation({
    mutationFn: () =>
      Fleet.approveRun(runId as string, {
        chosenPods,
        gpuType: gpuType ?? DEFAULT_GPU,
        concurrencyPerPod,
        autoStart,
        autoDestroy,
      }),
    onSuccess: () => {
      toast.success(autoStart ? "Run approved — provisioning + dialing"
                              : "Run approved — provisioning (pods will wait for Start)");
      onOpenChange(false); onChanged();
    },
    onError: (e) => toastApiError(e),
  });
  const reject = useMutation({
    mutationFn: () => Fleet.rejectRun(runId as string, "rejected by admin"),
    onSuccess: () => { toast.success("Run rejected"); onOpenChange(false); onChanged(); },
    onError: (e) => toastApiError(e),
  });
  const busy = approve.isPending || reject.isPending;

  const c = detail.data?.campaign ?? null;
  const ownerEmail = detail.data?.ownerEmail ?? null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Review & deploy run</DialogTitle>
          <DialogDescription>
            Inspect the campaign, size the fleet, then provision RunPod pods or reject.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {/* Campaign details */}
          <section className="space-y-3">
            <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
              Campaign details
            </p>
            {detail.isLoading ? (
              <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-14" />)}
              </div>
            ) : !c ? (
              <div className="rounded-lg border border-dashed border-border bg-muted/20 px-3 py-6 text-center text-sm text-muted-foreground">
                The campaign for this run was deleted. You can still reject the request.
                {ownerEmail && <span className="mt-1 block">Requested by {ownerEmail}.</span>}
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                <ConfigItem icon={MailIcon} label="Owner" value={ownerEmail ?? "—"} />
                <ConfigItem icon={BotIcon} label="Assistant" value={c.assistantName ?? "—"} />
                <ConfigItem icon={PhoneOutgoingIcon} label="From number"
                  value={<span className="tabular">{c.fromNumber ?? "—"}</span>} />
                <ConfigItem icon={UsersIcon} label="Leads"
                  value={c.leadCount === null ? "—" : c.leadCount.toLocaleString()} />
                <ConfigItem icon={GaugeIcon} label="Concurrency"
                  value={`${c.concurrency ?? 1} at once`} />
                <ConfigItem icon={ClockIcon} label="Delay between calls"
                  value={`${c.delayBetweenCalls ?? 0}s`} />
                <ConfigItem icon={TimerIcon} label="Max call duration"
                  value={`${Math.round((c.maxCallDuration ?? 900) / 60)} min cap`} />
                <ConfigItem icon={ActivityIcon} label="Campaign status"
                  value={<span className="capitalize">{c.status}</span>} />
              </div>
            )}
          </section>

          {/* Leads preview — so the admin can eyeball the list before sizing */}
          {c && (
            <section className="space-y-2">
              <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                Leads preview
                {c.leadCount != null && (
                  <span className="ml-1 normal-case tracking-normal text-muted-foreground/70">
                    (showing {Math.min(detail.data?.leadsPreview?.length ?? 0, c.leadCount)} of {c.leadCount.toLocaleString()})
                  </span>
                )}
              </p>
              {detail.isLoading ? (
                <Skeleton className="h-24" />
              ) : (detail.data?.leadsPreview?.length ?? 0) === 0 ? (
                <div className="rounded-lg border border-dashed border-border bg-muted/20 px-3 py-4 text-center text-sm text-muted-foreground">
                  No leads found for this campaign.
                </div>
              ) : (
                <div className="max-h-44 overflow-y-auto rounded-lg border border-border">
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 bg-muted/40 text-[10px] uppercase tracking-wider text-muted-foreground">
                      <tr>
                        <th className="px-3 py-1.5 text-left font-medium">Name</th>
                        <th className="px-3 py-1.5 text-left font-medium">Phone</th>
                        <th className="px-3 py-1.5 text-left font-medium">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(detail.data?.leadsPreview ?? []).map((l) => (
                        <tr key={l.id} className="border-t border-border/60">
                          <td className="truncate px-3 py-1.5">{l.name || "—"}</td>
                          <td className="px-3 py-1.5 tabular">{l.phone}</td>
                          <td className="px-3 py-1.5 capitalize text-muted-foreground">{l.status ?? "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          )}

          {/* Recommendation */}
          <section className="space-y-3">
            <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
              Recommendation
            </p>
            <div className="grid grid-cols-3 gap-2.5">
              <ConfigItem icon={CpuIcon} label="Recommended pods"
                value={<span className="tabular">{run?.recommendedPods ?? "—"}</span>} />
              <ConfigItem icon={UsersIcon} label="Lead count"
                value={<span className="tabular">{(run?.leadCount ?? 0).toLocaleString()}</span>} />
              <ConfigItem icon={ActivityIcon} label="Est. cost"
                value={<span className="tabular">{fmtCost(run?.estCost)}</span>} />
            </div>
          </section>

          {/* Deploy form */}
          <section className="space-y-3">
            <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
              Size the fleet
            </p>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Pod count</label>
                <Input type="number" min={1} step={1} className="tabular" value={chosenPods}
                  onChange={(e) => setChosenPods(Math.max(1, Number(e.target.value)))} />
              </div>
              <div className="space-y-1.5 col-span-2">
                <label className="text-sm font-medium">GPU type</label>
                <Select items={GPU_ITEMS} value={gpuType} onValueChange={(v) => setGpuType(v as string | null)}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select a GPU" />
                  </SelectTrigger>
                  <SelectContent>
                    {GPU_OPTIONS.map((g) => (
                      <SelectItem key={g.value} value={g.value}>
                        <CpuIcon className="size-3.5 text-muted-foreground" />
                        {g.label}
                        <span className="text-[10px] text-muted-foreground">{g.hint}</span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Concurrency per pod</label>
              <Input type="number" min={1} step={1} className="tabular w-32" value={concurrencyPerPod}
                onChange={(e) => setConcurrency(Math.max(1, Number(e.target.value)))} />
            </div>

            <div className="space-y-3 rounded-lg border border-border p-3">
              <label className="flex items-start justify-between gap-3">
                <span className="space-y-0.5">
                  <span className="block text-sm font-medium">Start calling automatically</span>
                  <span className="block text-xs text-muted-foreground">
                    {autoStart ? "Pods dial as soon as they're up."
                               : "Pods come up ready and wait for Start."}
                  </span>
                </span>
                <Switch checked={autoStart} onCheckedChange={setAutoStart} />
              </label>
              <label className="flex items-start justify-between gap-3">
                <span className="space-y-0.5">
                  <span className="block text-sm font-medium">Auto-destroy when finished</span>
                  <span className="block text-xs text-muted-foreground">
                    {autoDestroy ? "Tear pods down once all leads are dialed."
                                 : "Keep pods up after finishing for re-dial / inspection."}
                  </span>
                </span>
                <Switch checked={autoDestroy} onCheckedChange={setAutoDestroy} />
              </label>
            </div>
          </section>
        </div>

        <DialogFooter className="sm:justify-between">
          <Button variant="outline" onClick={() => reject.mutate()} disabled={busy || !runId}
            className="text-destructive hover:bg-destructive/10 hover:text-destructive">
            {reject.isPending ? "Rejecting…" : "Reject"}
          </Button>
          <Button onClick={() => approve.mutate()} disabled={busy || !runId}>
            <RocketIcon className="size-4" />
            {approve.isPending ? "Deploying…" : "Deploy RunPod"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
