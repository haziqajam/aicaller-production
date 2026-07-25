"use client";

import * as React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Pools, type BotPool } from "@/lib/api/pools";
import { Fleet, type InboundSlot } from "@/lib/api/fleet";
import { toastApiError, parseApiError } from "@/lib/api/errors";
import { getRole } from "@/lib/auth";
import { VicidialPipeline } from "@/components/fleet/vicidial-teach";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { LayersIcon, ShieldIcon, PlusIcon } from "lucide-react";

function NotAuthorized() {
  return (
    <div className="flex flex-1 items-center justify-center py-20">
      <Card className="w-full max-w-sm">
        <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
          <div className="flex size-10 items-center justify-center rounded-lg bg-muted">
            <ShieldIcon className="size-5 text-muted-foreground" aria-hidden />
          </div>
          <div className="space-y-1">
            <p className="text-sm font-semibold">Not authorized</p>
            <p className="text-xs text-muted-foreground max-w-xs">
              Admin access is required to manage pod pools.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

/** Live pod keys (registry `podId`) an admin can attach or swap to. */
function usePodKeys() {
  return useQuery<InboundSlot[]>({
    queryKey: ["inbound-registry"],
    queryFn: Fleet.inboundRegistry,
    refetchInterval: 20000,
  });
}

function PoolDialog({ pool }: { pool?: BotPool }) {
  const qc = useQueryClient();
  const editing = !!pool;
  const [open, setOpen] = React.useState(false);
  const [name, setName] = React.useState(pool?.name ?? "");
  const [members, setMembers] = React.useState<string[]>(pool?.memberPodKeys ?? []);
  const [saving, setSaving] = React.useState(false);
  const { data: slots } = usePodKeys();

  // Reset the form each time the dialog opens (edit vs create).
  React.useEffect(() => {
    if (open) {
      setName(pool?.name ?? "");
      setMembers(pool?.memberPodKeys ?? []);
    }
  }, [open, pool]);

  const known = new Set((slots ?? []).map((s) => s.podId));
  // Show live pods + any stored members no longer live (so they can be removed).
  const options = Array.from(new Set([...(slots ?? []).map((s) => s.podId), ...members]));

  function toggle(key: string) {
    setMembers((m) => (m.includes(key) ? m.filter((k) => k !== key) : [...m, key]));
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      if (editing) {
        await Pools.update(pool!.id, { name, memberPodKeys: members });
      } else {
        await Pools.create({ name, memberPodKeys: members });
      }
      setOpen(false);
      await qc.invalidateQueries({ queryKey: ["bot-pools"] });
      toast.success(editing ? "Pool updated" : "Pool created");
    } catch (err) {
      toastApiError(err, "Couldn't save pool");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {editing ? (
        <DialogTrigger render={<Button variant="outline" size="sm" />}>Edit</DialogTrigger>
      ) : (
        <DialogTrigger render={<Button />}>
          <PlusIcon className="size-4" aria-hidden />
          New pool
        </DialogTrigger>
      )}
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{editing ? "Edit pool" : "New pod pool"}</DialogTitle>
          <DialogDescription>
            A pool binds seats to one or more pods. Swap the underlying pod any time
            without touching seats or the client&apos;s VICIdial config.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSave} className="space-y-3">
          <div className="space-y-1">
            <label className="text-xs font-medium text-foreground">Name</label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. eu-inbound-1"
              required
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-foreground">Member pods</label>
            {options.length === 0 && (
              <p className="text-xs text-muted-foreground">
                No live inbound pods to attach yet.
              </p>
            )}
            <div className="max-h-52 space-y-1.5 overflow-y-auto rounded-md border border-border p-2">
              {options.map((key) => (
                <label key={key} className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={members.includes(key)}
                    onCheckedChange={() => toggle(key)}
                  />
                  <span className="font-mono text-xs truncate">{key}</span>
                  {!known.has(key) && (
                    <span className="text-[10px] text-muted-foreground">(offline)</span>
                  )}
                </label>
              ))}
            </div>
          </div>
          <DialogFooter>
            <Button type="submit" disabled={saving} className="w-full">
              {saving ? "Saving…" : editing ? "Save changes" : "Create pool"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function SwapDialog({ pool }: { pool: BotPool }) {
  const qc = useQueryClient();
  const [open, setOpen] = React.useState(false);
  const [oldKey, setOldKey] = React.useState<string>(pool.memberPodKeys[0] ?? "");
  const [newKey, setNewKey] = React.useState<string>("");
  const [saving, setSaving] = React.useState(false);
  const { data: slots } = usePodKeys();
  const liveKeys = (slots ?? []).filter((s) => s.status === "ready").map((s) => s.podId);

  async function handleSwap() {
    if (!newKey) return;
    setSaving(true);
    try {
      await Pools.swap(pool.id, { oldPodKey: oldKey || null, newPodKey: newKey });
      setOpen(false);
      await qc.invalidateQueries({ queryKey: ["bot-pools"] });
      toast.success("Pool re-pointed — seats follow automatically");
    } catch (err) {
      toastApiError(err, "Couldn't swap pod");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="outline" size="sm" />}>Swap pod</DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Swap pod for {pool.name}</DialogTitle>
          <DialogDescription>
            Re-point this pool to a fresh pod. In-flight calls drain on the old pod;
            new calls route to the new one. The client never reconfigures.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <label className="text-xs font-medium text-foreground">Replace (old pod)</label>
            <Select value={oldKey || undefined} onValueChange={(v) => setOldKey(v ?? "")}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="(add only — no replacement)" />
              </SelectTrigger>
              <SelectContent>
                {pool.memberPodKeys.map((k) => (
                  <SelectItem key={k} value={k}>{k}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-foreground">With (new live pod)</label>
            <Select value={newKey || undefined} onValueChange={(v) => setNewKey(v ?? "")}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Choose a ready pod…" />
              </SelectTrigger>
              <SelectContent>
                {liveKeys.length === 0 && (
                  <SelectItem value="__none" disabled>No ready pods</SelectItem>
                )}
                {liveKeys.map((k) => (
                  <SelectItem key={k} value={k}>{k}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button onClick={handleSwap} disabled={saving || !newKey} className="w-full">
              {saving ? "Swapping…" : "Swap"}
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function DeletePoolButton({ pool }: { pool: BotPool }) {
  const qc = useQueryClient();
  const [open, setOpen] = React.useState(false);
  const [loading, setLoading] = React.useState(false);

  async function handleDelete() {
    setLoading(true);
    try {
      await Pools.remove(pool.id);
      setOpen(false);
      await qc.invalidateQueries({ queryKey: ["bot-pools"] });
      toast.success("Pool deleted — attached seats fall back to the warm pool");
    } catch (err) {
      toastApiError(err, "Couldn't delete pool");
    } finally {
      setLoading(false);
    }
  }

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger render={<Button variant="destructive" size="sm" />}>
        Delete
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete pool?</AlertDialogTitle>
          <AlertDialogDescription>
            Seats attached to <strong>{pool.name}</strong> will fall back to the whole
            warm pool. This cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction variant="destructive" onClick={handleDelete} disabled={loading}>
            {loading ? "Deleting…" : "Delete"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export default function PodPoolsPage() {
  const role = getRole();
  if (role !== "admin") return <NotAuthorized />;
  return <PoolsContent />;
}

function PoolsContent() {
  const { data, isLoading, isError, error } = useQuery<BotPool[]>({
    queryKey: ["bot-pools"],
    queryFn: Pools.list,
  });
  const pools = data ?? [];

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            VICIdial admin
          </p>
          <h1 className="mt-0.5 text-base font-semibold text-foreground">Pod pools</h1>
          <p className="text-xs text-muted-foreground mt-0.5 max-w-prose">
            A pool is a swappable group of GPU pods that seats route through. Bind a seat to
            a pool and you can replace the underlying pod any time without the seat or the
            client&apos;s VICIdial changing. Seats with no pool use the{" "}
            <span className="font-medium text-foreground">warm pool</span> — the shared set of
            all ready pods.
          </p>
        </div>
        <PoolDialog />
      </div>

      <VicidialPipeline active="pool" />

      {isLoading && (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-20 w-full" />
          ))}
        </div>
      )}

      {isError && (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            {parseApiError(error, "Couldn't load pools.")}
          </CardContent>
        </Card>
      )}

      {!isLoading && !isError && pools.length === 0 && (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-14 text-center">
            <div className="flex size-10 items-center justify-center rounded-lg bg-muted">
              <LayersIcon className="size-5 text-muted-foreground" aria-hidden />
            </div>
            <div className="space-y-1">
              <p className="text-sm font-medium">No pools yet</p>
              <p className="text-xs text-muted-foreground max-w-xs">
                Create a pool and attach a pod, then bind seats to it. Swapping the pod
                later re-points every attached seat instantly.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {!isLoading && !isError && pools.length > 0 && (
        <div className="space-y-2">
          {pools.map((p) => (
            <Card key={p.id}>
              <CardContent className="flex items-center justify-between gap-4 py-3">
                <div className="min-w-0 space-y-1">
                  <p className="text-sm font-medium text-foreground">{p.name}</p>
                  <p className="text-xs text-muted-foreground truncate">
                    {p.memberPodKeys.length
                      ? p.memberPodKeys.join(", ")
                      : "No pods — seats fall back to the warm pool"}
                  </p>
                  {p.lastRebindAt && (
                    <p className="text-[11px] text-muted-foreground">
                      Last rebind: {new Date(p.lastRebindAt).toLocaleString()}
                    </p>
                  )}
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <SwapDialog pool={p} />
                  <PoolDialog pool={p} />
                  <DeletePoolButton pool={p} />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
