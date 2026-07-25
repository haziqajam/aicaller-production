"use client";

import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Fleet, type PodRecord, type AdminSeat } from "@/lib/api/fleet";
import { toastApiError } from "@/lib/api/errors";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Loader2Icon, BotIcon, UsersIcon } from "lucide-react";
import { CapacityMeter } from "@/components/fleet/vicidial-teach";

/**
 * Attach one or more PBX bots (seats) to THIS pod, right from the deploy screen.
 * A full SET operation per pod: the checked seats are pinned to the pod (seat.podId),
 * unchecked ones are detached. Once saved, the PBX auto-routes those seats' SIP calls
 * to this pod — no edge reconfiguration. Capacity + AudioSocket-capability enforced
 * server-side (a pod with no AudioSocket endpoint is rejected with a clear message).
 */
export function AttachPodBotsDialog({ pod }: { pod: PodRecord }) {
  const qc = useQueryClient();
  const [open, setOpen] = React.useState(false);
  const [q, setQ] = React.useState("");
  const [picked, setPicked] = React.useState<Set<string>>(new Set());

  // Seats bind to a pod by its REGISTRY key (inboundToken || id) — same as allocate.
  const podKey = pod.inboundToken || pod.id;

  const seatsQ = useQuery<AdminSeat[]>({
    queryKey: ["admin-seats-all"],
    queryFn: () => Fleet.allSeats(false),
    enabled: open,
  });

  // Seed the selection from seats already on THIS pod, once the list arrives.
  const [seededFor, setSeededFor] = React.useState<AdminSeat[] | null>(null);
  if (open && seatsQ.data && seatsQ.data !== seededFor) {
    setSeededFor(seatsQ.data);
    setPicked(new Set(seatsQ.data.filter((s) => s.podId === podKey).map((s) => s.id)));
  }
  if (!open && seededFor !== null) setSeededFor(null);  // reset for next open

  const save = useMutation({
    mutationFn: () => Fleet.setPodBots(pod.id, [...picked]),
    onSuccess: (r) => {
      if (r.warning) toast.warning(r.warning);
      else toast.success(`Roster saved — ${r.attached} attached, ${r.detached} detached`);
      qc.invalidateQueries({ queryKey: ["admin-seats-all"] });
      qc.invalidateQueries({ queryKey: ["fleet-inbound-pods"] });
      setOpen(false);
    },
    onError: (e) => toastApiError(e, "Couldn't attach bots"),
  });

  const rows = (seatsQ.data ?? []).filter((s) =>
    !q || (s.name ?? "").toLowerCase().includes(q.toLowerCase()) ||
    (s.ownerEmail ?? "").toLowerCase().includes(q.toLowerCase()));

  function toggle(id: string, on: boolean) {
    setPicked((prev) => {
      const next = new Set(prev);
      if (on) next.add(id); else next.delete(id);
      return next;
    });
  }

  const cap = pod.maxConcurrentCalls ?? 0;
  const used = (seatsQ.data ?? [])
    .filter((s) => picked.has(s.id))
    .reduce((n, s) => n + s.maxConcurrent, 0);
  const overCap = cap > 0 && used > cap;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={
        <Button variant="outline" size="sm" title="Attach bots to this pod">
          <UsersIcon className="size-3.5" /> Attach bots
        </Button>} />
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UsersIcon className="size-4 text-primary" /> Attach bots to this pod
          </DialogTitle>
          <DialogDescription>
            Checked bots run on this pod — the PBX auto-routes their SIP/VICIdial calls
            here. Unchecking detaches (falls back to the warm pool). Needs an AudioSocket-
            ready pod.
          </DialogDescription>
        </DialogHeader>

        <Input placeholder="Search bots or owners…" value={q}
          onChange={(e) => setQ(e.target.value)} />

        {/* Live capacity while picking — overflow is visible before saving, not after. */}
        <CapacityMeter used={used} cap={cap} />

        <div className="max-h-[45vh] space-y-1 overflow-y-auto">
          {seatsQ.isLoading ? (
            <>
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
            </>
          ) : rows.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              {q ? "No matching bots." : "No bot seats exist yet."}
            </p>
          ) : (
            rows.map((s) => {
              const onAnother = !!s.podId && s.podId !== podKey;
              return (
                <label key={s.id}
                  className="flex items-start gap-3 rounded-lg border p-3 cursor-pointer hover:bg-muted/50">
                  <Checkbox checked={picked.has(s.id)}
                    onCheckedChange={(c) => toggle(s.id, Boolean(c))} />
                  <div className="min-w-0 space-y-0.5">
                    <div className="flex items-center gap-1.5 text-sm font-medium">
                      <BotIcon className="size-3.5 text-muted-foreground" />
                      {s.name || s.id}
                      <span className="text-xs text-muted-foreground">×{s.maxConcurrent}</span>
                    </div>
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      {s.ownerEmail && <span className="truncate">{s.ownerEmail}</span>}
                      {onAnother && (
                        <span className="ml-1 rounded-sm border border-border px-1 text-[10px]">
                          on another pod
                        </span>
                      )}
                    </div>
                  </div>
                </label>
              );
            })
          )}
        </div>

        <DialogFooter className="items-center">
          {overCap && (
            <span className="mr-auto text-xs text-destructive">
              Over capacity — uncheck a bot or raise the pod cap
            </span>
          )}
          <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={() => save.mutate()} disabled={save.isPending || overCap}>
            {save.isPending && <Loader2Icon className="size-4 animate-spin" />}
            Attach {picked.size} bot{picked.size === 1 ? "" : "s"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
