"use client";

import * as React from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Numbers } from "@/lib/api/resources";
import { Fleet, type PodRecord } from "@/lib/api/fleet";
import { toastApiError } from "@/lib/api/errors";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Loader2Icon, PhoneIcon, BotIcon, LinkIcon } from "lucide-react";

type NumberRow = {
  id: string;
  phoneNumber: string;
  assistantId?: string | null;
  assistantName?: string | null;
  pinnedPodId?: string | null;
};

/**
 * Attach this pod to one or more of the caller's numbers. Inbound calls to a pinned
 * number run on THIS pod's GPU. A number must already have an assistant (assign it on
 * the Inbound routing page first) — numbers without one are shown disabled.
 *
 * This is a full SET operation per pod: checking/unchecking commits the exact set of
 * numbers routed to this pod (unchecking detaches → the number falls back to the pool).
 */
export function AttachPodNumbersDialog({ pod }: { pod: PodRecord }) {
  const qc = useQueryClient();
  const [open, setOpen] = React.useState(false);
  const [q, setQ] = React.useState("");
  const [picked, setPicked] = React.useState<Set<string>>(new Set());

  const numbersQ = useQuery<NumberRow[]>({
    queryKey: ["numbers"],
    queryFn: Numbers.list,
    enabled: open,
  });

  // Seed the selection from numbers already pinned to THIS pod, once per open (render-
  // time sync against a prevOpen guard — no setState-in-effect).
  const [prevOpen, setPrevOpen] = React.useState(false);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open && numbersQ.data) {
      setPicked(new Set(numbersQ.data.filter((n) => n.pinnedPodId === pod.id).map((n) => n.id)));
    }
  }
  // Also seed once the list arrives while already open (first open before data loads).
  const [seededFor, setSeededFor] = React.useState<NumberRow[] | null>(null);
  if (open && numbersQ.data && numbersQ.data !== seededFor) {
    setSeededFor(numbersQ.data);
    setPicked(new Set(numbersQ.data.filter((n) => n.pinnedPodId === pod.id).map((n) => n.id)));
  }

  const save = useMutation({
    mutationFn: () => Fleet.attachPodNumbers(pod.id, [...picked]),
    onSuccess: (r) => {
      toast.success(`Routing ${r.attached} number${r.attached === 1 ? "" : "s"} to this pod`);
      qc.invalidateQueries({ queryKey: ["numbers"] });
      qc.invalidateQueries({ queryKey: ["fleet-inbound-pods"] });
      setOpen(false);
    },
    onError: (e) => toastApiError(e, "Couldn't attach numbers"),
  });

  const rows = (numbersQ.data ?? []).filter((n) =>
    !q || n.phoneNumber.toLowerCase().includes(q.toLowerCase()) ||
    (n.assistantName ?? "").toLowerCase().includes(q.toLowerCase()));

  function toggle(id: string, on: boolean) {
    setPicked((prev) => {
      const next = new Set(prev);
      if (on) next.add(id); else next.delete(id);
      return next;
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={
        <Button variant="outline" size="sm" title="Attach numbers to this pod">
          <LinkIcon className="size-3.5" /> Attach numbers
        </Button>} />
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <LinkIcon className="size-4 text-primary" /> Attach numbers to this pod
          </DialogTitle>
          <DialogDescription>
            Inbound calls to a checked number run on this pod&apos;s GPU. Unchecking
            detaches it (it falls back to the warm pool). A number needs an assistant
            first — set that on the Inbound routing page.
          </DialogDescription>
        </DialogHeader>

        <Input placeholder="Search numbers or assistants…" value={q}
          onChange={(e) => setQ(e.target.value)} />

        <div className="max-h-[45vh] space-y-1 overflow-y-auto">
          {numbersQ.isLoading ? (
            <>
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
            </>
          ) : rows.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              {q ? "No matching numbers." : "You have no numbers yet."}
            </p>
          ) : (
            rows.map((n) => {
              const hasAssistant = !!n.assistantId;
              const pinnedElsewhere = !!n.pinnedPodId && n.pinnedPodId !== pod.id;
              return (
                <label key={n.id}
                  className={`flex items-start gap-3 rounded-lg border p-3 ${hasAssistant ? "cursor-pointer hover:bg-muted/50" : "opacity-60"}`}>
                  <Checkbox
                    checked={picked.has(n.id)}
                    disabled={!hasAssistant}
                    onCheckedChange={(c) => toggle(n.id, Boolean(c))}
                  />
                  <div className="min-w-0 space-y-0.5">
                    <div className="flex items-center gap-1.5 text-sm font-medium">
                      <PhoneIcon className="size-3.5 text-muted-foreground" />
                      {n.phoneNumber}
                    </div>
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <BotIcon className="size-3 shrink-0" />
                      {hasAssistant
                        ? <span className="truncate">{n.assistantName ?? "assigned assistant"}</span>
                        : <span className="text-amber-400">No assistant — assign one first</span>}
                      {pinnedElsewhere && (
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

        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={() => save.mutate()} disabled={save.isPending}>
            {save.isPending && <Loader2Icon className="size-4 animate-spin" />}
            Route {picked.size} number{picked.size === 1 ? "" : "s"} here
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
