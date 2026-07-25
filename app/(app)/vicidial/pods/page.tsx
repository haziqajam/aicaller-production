"use client";

import * as React from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { Fleet, type PodRecord, type InboundSlot, type AdminSeat } from "@/lib/api/fleet";
import { toastApiError, parseApiError } from "@/lib/api/errors";
import { getRole } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogTrigger,
} from "@/components/ui/dialog";
import { ServerIcon, ShieldIcon, AlertTriangleIcon, ArrowRightLeftIcon, RotateCwIcon } from "lucide-react";
import { VicidialPipeline, CapacityMeter } from "@/components/fleet/vicidial-teach";
import { PodStatusBadge } from "@/components/fleet/pod-status-badge";

function NotAuthorized() {
  return (
    <div className="flex flex-1 items-center justify-center py-20">
      <Card className="w-full max-w-sm">
        <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
          <div className="flex size-10 items-center justify-center rounded-lg bg-muted">
            <ShieldIcon className="size-5 text-muted-foreground" aria-hidden />
          </div>
          <p className="text-sm font-semibold">Not authorized</p>
          <p className="text-xs text-muted-foreground max-w-xs">
            Admin access is required to manage pods.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

/** Capacity + PBX-bot roster + model overrides for one pod. */
function ManagePodDialog({ pod, live }: { pod: PodRecord; live?: InboundSlot }) {
  const qc = useQueryClient();
  const [open, setOpen] = React.useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="outline" size="sm" />}>Manage</DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Manage pod</DialogTitle>
          <DialogDescription className="font-mono text-xs">
            {pod.inboundToken || pod.id}
          </DialogDescription>
        </DialogHeader>
        {open && <ManageBody pod={pod} live={live} onChange={() => {
          qc.invalidateQueries({ queryKey: ["inbound-pods"] });
          qc.invalidateQueries({ queryKey: ["inbound-registry"] });
        }} />}
      </DialogContent>
    </Dialog>
  );
}

function ManageBody({ pod, live, onChange }: {
  pod: PodRecord; live?: InboundSlot; onChange: () => void;
}) {
  const qc = useQueryClient();
  const [cap, setCap] = React.useState<string>(
    pod.maxConcurrentCalls != null ? String(pod.maxConcurrentCalls) : (live ? String(live.cap) : ""));
  const [savingCap, setSavingCap] = React.useState(false);

  // Roster = which bot seats run on THIS pod. Multi-select over all seats, pre-checked
  // for those already pinned here (seat.podId === this pod's registry key).
  const podKey = pod.inboundToken || pod.id;
  const seatsQ = useQuery<AdminSeat[]>({
    queryKey: ["admin-seats-all"], queryFn: () => Fleet.allSeats(false),
  });
  const [selected, setSelected] = React.useState<Set<string> | null>(null);
  React.useEffect(() => {
    if (seatsQ.data && selected === null) {
      setSelected(new Set(seatsQ.data.filter((s) => s.podId === podKey).map((s) => s.id)));
    }
  }, [seatsQ.data, selected, podKey]);
  const [savingRoster, setSavingRoster] = React.useState(false);

  const [ollama, setOllama] = React.useState((pod.ollamaModels ?? []).join(", "));
  const [whisper, setWhisper] = React.useState((pod.whisperModels ?? []).join(", "));
  const [vibe, setVibe] = React.useState(pod.prewarmVibeVoice ?? true);
  const [savingModels, setSavingModels] = React.useState(false);

  async function saveCap() {
    const n = Number(cap);
    if (!n || n < 1) return;
    setSavingCap(true);
    try {
      await Fleet.setPodCapacity(pod.id, n);
      toast.success(`Capacity set to ${n}`);
      onChange();
    } catch (e) { toastApiError(e, "Couldn't set capacity"); }
    finally { setSavingCap(false); }
  }

  function toggleSeat(id: string) {
    setSelected((prev) => {
      const next = new Set(prev ?? []);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  async function saveRoster() {
    setSavingRoster(true);
    try {
      const res = await Fleet.setPodBots(pod.id, [...(selected ?? [])]);
      if (res.warning) toast.warning(res.warning);
      else toast.success(`Roster saved — ${res.attached} attached, ${res.detached} detached`);
      await qc.invalidateQueries({ queryKey: ["admin-seats-all"] });
      onChange();
    } catch (e) { toastApiError(e, "Couldn't save roster"); }
    finally { setSavingRoster(false); }
  }

  async function saveModels() {
    setSavingModels(true);
    try {
      await Fleet.setPodModels(pod.id, {
        ollamaModels: ollama.split(",").map((s) => s.trim()).filter(Boolean),
        whisperModels: whisper.split(",").map((s) => s.trim()).filter(Boolean),
        prewarmVibeVoice: vibe,
      });
      toast.success("Model overrides saved — apply on next (re)deploy");
      onChange();
    } catch (e) { toastApiError(e, "Couldn't save model overrides"); }
    finally { setSavingModels(false); }
  }

  const seats = seatsQ.data ?? [];
  const sel = selected ?? new Set<string>();
  const capNum = pod.maxConcurrentCalls ?? live?.cap ?? 0;
  const usedBySel = seats
    .filter((s) => sel.has(s.id))
    .reduce((n, s) => n + s.maxConcurrent, 0);
  const overCap = capNum > 0 && usedBySel > capNum;

  return (
    <div className="space-y-5">
      {/* Capacity */}
      <section className="space-y-1.5">
        <p className="text-sm font-medium">Concurrent-call capacity</p>
        <div className="flex items-center gap-2">
          <Input type="number" min={1} value={cap} onChange={(e) => setCap(e.target.value)}
            className="w-28" placeholder="e.g. 5" />
          <Button size="sm" onClick={saveCap} disabled={savingCap}>Save</Button>
          {live && (
            <span className="text-xs text-muted-foreground">
              live: {live.active}/{live.cap} in use
            </span>
          )}
        </div>
        <p className="text-xs text-muted-foreground">
          Max simultaneous calls this pod sustains. Bounds the bot roster below.
        </p>
      </section>

      {/* Roster — attach one or more bots */}
      <section className="space-y-2">
        <p className="text-sm font-medium">PBX bots on this pod</p>
        <p className="text-xs text-muted-foreground">
          Check the bots to run on this pod. Once saved, the PBX auto-routes their
          incoming calls here — no edge reconfiguration.
        </p>
        {/* Live meter ABOVE the picker: overflow is visible while choosing, not after. */}
        <CapacityMeter used={usedBySel} cap={capNum} />
        <div className="max-h-56 space-y-1 overflow-y-auto rounded-md border border-border p-2">
          {seats.length === 0 && (
            <p className="text-xs text-muted-foreground">No bot seats exist yet.</p>
          )}
          {seats.map((s) => (
            <label key={s.id} className="flex items-center gap-2 text-sm">
              <Checkbox checked={sel.has(s.id)} onCheckedChange={() => toggleSeat(s.id)} />
              <span className="truncate">{s.name || s.id}</span>
              <span className="text-xs text-muted-foreground">
                ×{s.maxConcurrent}{s.ownerEmail ? ` · ${s.ownerEmail}` : ""}
              </span>
              {s.podId && s.podId !== podKey && (
                <span className="text-[10px] text-muted-foreground">(on another pod)</span>
              )}
            </label>
          ))}
        </div>
        <Button size="sm" onClick={saveRoster} disabled={savingRoster || overCap}>
          {savingRoster ? "Saving…" : "Save roster"}
        </Button>
        {overCap && (
          <p className="text-xs text-destructive">
            Exceeds capacity ({usedBySel}/{capNum}) — raise the cap or uncheck a bot.
          </p>
        )}
      </section>

      {/* Model overrides */}
      <section className="space-y-2">
        <p className="text-sm font-medium">Model / prewarm overrides</p>
        <p className="text-xs text-muted-foreground">
          Applies on the pod&apos;s next (re)deploy. Blank = inherit the pool config.
        </p>
        <div className="space-y-1">
          <label className="text-xs font-medium">Ollama models (comma-separated)</label>
          <Input value={ollama} onChange={(e) => setOllama(e.target.value)}
            placeholder="gemma4:e2b, qwen3.5:9b" />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium">Whisper sizes (comma-separated)</label>
          <Input value={whisper} onChange={(e) => setWhisper(e.target.value)}
            placeholder="large-v3-turbo" />
        </div>
        <label className="flex items-center justify-between rounded-md border border-border px-2.5 py-2">
          <span className="text-sm">Prewarm VibeVoice TTS</span>
          <Switch checked={vibe} onCheckedChange={setVibe} />
        </label>
        <Button size="sm" onClick={saveModels} disabled={savingModels}>Save overrides</Button>
      </section>
    </div>
  );
}

/** One-click move of ALL a pod's rostered bots to another healthy pod — the manual
 *  counterpart to the auto-rebind that fires on pod death. Only shown when the pod has
 *  bots; targets are limited to healthy pods with enough free capacity. */
function MoveBotsDialog({ pod, pods, seatsByPod, capOf }: {
  pod: PodRecord;
  pods: PodRecord[];
  seatsByPod: Map<string, AdminSeat[]>;
  capOf: (p: PodRecord) => number;
}) {
  const qc = useQueryClient();
  const [open, setOpen] = React.useState(false);
  const [target, setTarget] = React.useState<string>("");
  const srcKey = pod.inboundToken || pod.id;
  const srcBots = seatsByPod.get(srcKey) ?? [];
  const incoming = srcBots.reduce((n, s) => n + (s.maxConcurrent ?? 1), 0);
  const usedOf = (p: PodRecord) =>
    (seatsByPod.get(p.inboundToken || p.id) ?? []).reduce((n, s) => n + (s.maxConcurrent ?? 1), 0);
  const candidates = pods.filter((p) => {
    if ((p.inboundToken || p.id) === srcKey) return false;
    if (p.status === "missing" || p.status === "deprecated") return false;
    return capOf(p) - usedOf(p) >= incoming;      // room for the whole roster
  });
  const move = useMutation({
    mutationFn: () => Fleet.movePodBots(pod.id, target),
    onSuccess: (r) => {
      toast.success(`Moved ${r.moved} bot${r.moved === 1 ? "" : "s"} to the new pod`);
      qc.invalidateQueries({ queryKey: ["admin-seats-all"] });
      qc.invalidateQueries({ queryKey: ["inbound-pods"] });
      setOpen(false); setTarget("");
    },
    onError: (e) => toastApiError(e, "Couldn't move bots"),
  });
  if (srcBots.length === 0) return null;
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="outline" size="sm" />}>
        <ArrowRightLeftIcon className="size-3.5" /> Move bots
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Move bots to another pod</DialogTitle>
          <DialogDescription>
            Re-point all {srcBots.length} bot{srcBots.length === 1 ? "" : "s"} ({incoming} call
            slot{incoming === 1 ? "" : "s"}) on this pod to a healthy one. In-flight calls keep
            running; new calls route to the new pod. The client&apos;s VICIdial never changes.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-1.5">
          <label className="text-sm font-medium">Target pod</label>
          {candidates.length === 0 ? (
            <p className="text-xs text-amber-400">
              No healthy pod has room for {incoming} more call slot{incoming === 1 ? "" : "s"} —
              deploy or free up a pod first.
            </p>
          ) : (
            <Select value={target || null} onValueChange={(v) => setTarget(v ?? "")}>
              <SelectTrigger className="w-full"><SelectValue placeholder="Pick a healthy pod…" /></SelectTrigger>
              <SelectContent>
                {candidates.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    <span className="font-mono">{p.inboundToken || p.id}</span> · {capOf(p) - usedOf(p)} free
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
        <div className="flex justify-end gap-2 pt-1">
          <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={() => move.mutate()} disabled={!target || move.isPending}>
            {move.isPending ? "Moving…" : "Move bots"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** Re-up a dead pod: redeploy an identical replacement (same hostname); rostered bots
 *  auto-follow via rebind, so the client reconfigures nothing. */
function ReupPodButton({ podId }: { podId: string }) {
  const qc = useQueryClient();
  const reup = useMutation({
    mutationFn: () => Fleet.reup(podId),
    onSuccess: () => {
      toast.success("Re-upping — a replacement pod is provisioning; bots re-attach automatically");
      qc.invalidateQueries({ queryKey: ["inbound-pods"] });
    },
    onError: (e) => toastApiError(e, "Couldn't re-up"),
  });
  return (
    <Button variant="outline" size="sm" onClick={() => reup.mutate()} disabled={reup.isPending}>
      <RotateCwIcon className={reup.isPending ? "size-3.5 animate-spin" : "size-3.5"} />
      {reup.isPending ? "Re-upping…" : "Re-up"}
    </Button>
  );
}

/** Re-up EVERY down pod in one click — the bulk counterpart to per-pod Re-up, for
 *  when a host or region drops several pods at once. Fires them in parallel and reports
 *  how many kicked off. */
function ReupAllButton({ podIds }: { podIds: string[] }) {
  const qc = useQueryClient();
  const reupAll = useMutation({
    mutationFn: async () => {
      const results = await Promise.allSettled(podIds.map((id) => Fleet.reup(id)));
      const ok = results.filter((r) => r.status === "fulfilled").length;
      return { ok, failed: results.length - ok };
    },
    onSuccess: ({ ok, failed }) => {
      if (ok > 0)
        toast.success(`Re-upping ${ok} pod${ok === 1 ? "" : "s"} — replacements provisioning; bots re-attach automatically`);
      if (failed > 0) toast.error(`${failed} pod${failed === 1 ? "" : "s"} couldn't re-up — retry from its card`);
      qc.invalidateQueries({ queryKey: ["inbound-pods"] });
    },
    onError: (e) => toastApiError(e, "Couldn't re-up pods"),
  });
  return (
    <Button size="sm" onClick={() => reupAll.mutate()} disabled={reupAll.isPending}>
      <RotateCwIcon className={reupAll.isPending ? "size-3.5 animate-spin" : "size-3.5"} />
      {reupAll.isPending ? "Re-upping all…" : `Re-up all ${podIds.length}`}
    </Button>
  );
}

export default function PodsPage() {
  const role = getRole();
  if (role !== "admin") return <NotAuthorized />;
  return <PodsContent />;
}

function PodsContent() {
  const podsQ = useQuery<PodRecord[]>({ queryKey: ["inbound-pods"], queryFn: Fleet.inboundPods });
  const regQ = useQuery<InboundSlot[]>({
    queryKey: ["inbound-registry"], queryFn: Fleet.inboundRegistry, refetchInterval: 15000,
  });
  // Seats, to show which bots each pod carries — and who's affected if it's down.
  const seatsQ = useQuery<AdminSeat[]>({
    queryKey: ["admin-seats-all"], queryFn: () => Fleet.allSeats(false),
  });
  const pods = podsQ.data ?? [];
  const liveByKey = new Map((regQ.data ?? []).map((s) => [s.podId, s]));
  const capOf = (p: PodRecord) =>
    p.maxConcurrentCalls ?? liveByKey.get(p.inboundToken || p.id)?.cap ?? 0;
  const seatsByPod = new Map<string, AdminSeat[]>();
  for (const s of seatsQ.data ?? []) {
    if (!s.podId) continue;
    (seatsByPod.get(s.podId) ?? seatsByPod.set(s.podId, []).get(s.podId)!).push(s);
  }
  const unhealthy = pods.filter((p) => p.status === "missing" || p.status === "deprecated");

  return (
    <div className="space-y-4">
      <div>
        <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">VICIdial admin</p>
        <h1 className="mt-0.5 text-base font-semibold text-foreground">Pods</h1>
        <p className="text-xs text-muted-foreground mt-0.5 max-w-prose">
          GPU servers that run inbound VICIdial calls. A bot seat is <span className="font-medium">pinned</span> to
          a pod here (Manage → check the seats), and that pod runs its calls. If a pod dies, its
          seats keep working — calls fall back to the warm pool automatically, and a replacement
          is re-upped with the seats re-attached. You can also move a pod&apos;s seats to another
          pod yourself with <span className="font-medium">Move bots</span>.
        </p>
      </div>

      <VicidialPipeline active="pod" />

      {unhealthy.length > 0 && (
        <div className="flex items-start gap-2.5 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2.5 text-sm">
          <AlertTriangleIcon className="mt-0.5 size-4 shrink-0 text-amber-400" aria-hidden />
          <div className="min-w-0 flex-1">
            <p className="font-medium text-amber-200">
              {unhealthy.length} pod{unhealthy.length === 1 ? "" : "s"} need attention
            </p>
            <p className="text-xs text-amber-200/80">
              Their bots fall back to the warm pool automatically, so calls keep connecting.
              Recover in one click on the pod below: <span className="font-medium">Re-up</span> (redeploy
              the same pod — bots re-attach automatically) or <span className="font-medium">Move bots</span> to
              a healthy pod. The client&apos;s VICIdial never changes either way.
            </p>
          </div>
          {unhealthy.length > 1 && (
            <div className="shrink-0 self-center">
              <ReupAllButton podIds={unhealthy.map((p) => p.id)} />
            </div>
          )}
        </div>
      )}

      {podsQ.isLoading && (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}
        </div>
      )}
      {podsQ.isError && (
        <Card><CardContent className="py-10 text-center text-sm text-muted-foreground">
          {parseApiError(podsQ.error, "Couldn't load pods.")}
        </CardContent></Card>
      )}
      {!podsQ.isLoading && !podsQ.isError && pods.length === 0 && (
        <Card><CardContent className="flex flex-col items-center gap-3 py-14 text-center">
          <div className="flex size-10 items-center justify-center rounded-lg bg-muted">
            <ServerIcon className="size-5 text-muted-foreground" aria-hidden />
          </div>
          <p className="text-sm font-medium">No inbound pods</p>
          <p className="text-xs text-muted-foreground max-w-xs">
            Deploy warm inbound pods from the Fleet page, then manage their capacity and bots here.
          </p>
        </CardContent></Card>
      )}

      {pods.length > 0 && (
        <div className="space-y-2">
          {pods.map((p) => {
            const live = liveByKey.get(p.inboundToken || p.id);
            const cap = p.maxConcurrentCalls ?? live?.cap;
            const rosterBots = seatsByPod.get(p.inboundToken || p.id) ?? [];
            const down = p.status === "missing" || p.status === "deprecated";
            return (
              <Card key={p.id} className={down ? "border-amber-500/40" : undefined}>
                <CardContent className="flex items-center justify-between gap-4 py-3">
                  <div className="min-w-0 space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs truncate" title="Pod registry key (inbound token)">
                        {p.inboundToken || p.id}
                      </span>
                      <PodStatusBadge status={p.status} />
                    </div>
                    <p className="text-xs text-muted-foreground">
                      capacity {cap ?? "—"}
                      {live ? ` · ${live.active}/${live.cap} live` : ""}
                      {p.prewarmVibeVoice === false ? " · VibeVoice off" : ""}
                    </p>
                    {rosterBots.length > 0 && (
                      <p className={down ? "text-xs text-amber-300" : "text-xs text-muted-foreground"}>
                        {down ? "Affected bots" : "Bots"}: {rosterBots.map((s) => s.name || s.id).join(", ")}
                        {down && " · rerouting to warm pool"}
                      </p>
                    )}
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    {down && <ReupPodButton podId={p.id} />}
                    <MoveBotsDialog pod={p} pods={pods} seatsByPod={seatsByPod} capOf={capOf} />
                    <ManagePodDialog pod={p} live={live} />
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
