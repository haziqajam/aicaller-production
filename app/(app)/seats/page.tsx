"use client";

import * as React from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { Seats, type BotSeat, type SeatTransferTarget, type SeatAmiInput } from "@/lib/api/seats";
import { Pools } from "@/lib/api/pools";
import { Assistants, Flows } from "@/lib/api/resources";
import type { Assistant, Flow } from "@/lib/api/schemas";
import { toastApiError } from "@/lib/api/errors";
import { API_BASE } from "@/lib/api/client";
import { buildCarrierBlock, buildAllocateSnippet } from "@/lib/sip-config";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import Link from "next/link";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  PlusIcon, Trash2Icon, ServerIcon, CopyIcon, RotateCcwIcon, PencilIcon,
  PhoneIncomingIcon, CableIcon, BotIcon, ChevronRightIcon,
  CheckCircle2Icon, AlertTriangleIcon, CircleSlashIcon, BookOpenIcon,
} from "lucide-react";
import { getRole } from "@/lib/auth";
import { cn } from "@/lib/utils";

// One honest word about whether a call to this seat connects right now. Infra
// (pods/pools) stays behind the admin wall; clients see only this.
const ROUTE_HEALTH: Record<string, {
  label: string; hint: string; cls: string; Icon: typeof CheckCircle2Icon;
}> = {
  ok: {
    label: "Reachable", hint: "Calls to this seat connect now.",
    cls: "border-emerald-500/30 bg-emerald-500/10 text-emerald-400",
    Icon: CheckCircle2Icon,
  },
  degraded: {
    label: "Rerouting", hint: "Preferred capacity is down; calls still connect on backup.",
    cls: "border-amber-500/40 bg-amber-500/10 text-amber-400",
    Icon: AlertTriangleIcon,
  },
  down: {
    label: "No capacity", hint: "No server is ready — new calls can't connect yet.",
    cls: "border-destructive/40 bg-destructive/10 text-destructive",
    Icon: CircleSlashIcon,
  },
};

function SeatHealthBadge({ health }: { health?: string }) {
  const h = ROUTE_HEALTH[health ?? "down"] ?? ROUTE_HEALTH.down;
  return (
    // aria-label carries the full meaning (not just the tooltip, which SRs/touch miss).
    <Badge variant="outline" className={cn("gap-1", h.cls)} title={h.hint}
      aria-label={`${h.label}: ${h.hint}`}>
      <h.Icon className="size-3" aria-hidden /> {h.label}
    </Badge>
  );
}

// Base UI's Select rejects empty values; encode the agent choice as "a:<id>" /
// "f:<id>" so one control covers assistants AND flows.
function encodeAgent(seat: { assistantId?: string | null; flowId?: string | null }): string {
  if (seat.flowId) return `f:${seat.flowId}`;
  if (seat.assistantId) return `a:${seat.assistantId}`;
  return "";
}
function decodeAgent(v: string): { assistantId: string | null; flowId: string | null } {
  if (v.startsWith("f:")) return { assistantId: null, flowId: v.slice(2) };
  if (v.startsWith("a:")) return { assistantId: v.slice(2), flowId: null };
  return { assistantId: null, flowId: null };
}

type Draft = {
  name: string;
  agent: string;               // encoded "a:<id>" / "f:<id>"
  maxConcurrent: number;
  active: boolean;
  amdEnabled: boolean;
  notes: string;
  transferTargets: SeatTransferTarget[];
  amiEnabled: boolean;
  ami: { host: string; port: number; user: string; secret: string };
  sipEnabled: boolean;
  returnTarget: string;
  poolId: string;              // "" = whole warm pool
};

const EMPTY_DRAFT: Draft = {
  name: "", agent: "", maxConcurrent: 1, active: true, amdEnabled: true, notes: "",
  transferTargets: [],
  amiEnabled: false,
  ami: { host: "", port: 5038, user: "", secret: "" },
  sipEnabled: false,
  returnTarget: "",
  poolId: "",
};

// Base UI's Select rejects empty values; sentinel for "no pool" (whole warm pool).
const NO_POOL = "__warm_pool";

function SeatDialog({
  open, onOpenChange, seat, assistants, flows, onSaved, isAdmin,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  seat: BotSeat | null;               // null = create
  assistants: Assistant[];
  flows: Flow[];
  onSaved: () => void;
  isAdmin: boolean;                   // pod-pool binding is admin-only (infra stays hidden)
}) {
  const [d, setD] = React.useState<Draft>(EMPTY_DRAFT);

  // Seed the draft whenever the dialog opens (create → empty; edit → the seat).
  React.useEffect(() => {
    if (!open) return;
    if (seat) {
      setD({
        name: seat.name ?? "",
        agent: encodeAgent(seat),
        maxConcurrent: seat.maxConcurrent ?? 1,
        active: seat.active ?? true,
        amdEnabled: seat.amdEnabled ?? true,
        notes: seat.notes ?? "",
        transferTargets: seat.transferTargets ?? [],
        amiEnabled: !!seat.ami,
        ami: {
          host: seat.ami?.host ?? "",
          port: seat.ami?.port ?? 5038,
          user: seat.ami?.user ?? "",
          // "***" keeps the stored secret on save; blank when none exists.
          secret: seat.ami?.hasSecret ? "***" : "",
        },
        sipEnabled: seat.sipEnabled ?? false,
        returnTarget: seat.returnTarget ?? "",
        poolId: seat.poolId ?? "",
      });
    } else {
      setD(EMPTY_DRAFT);
    }
  }, [open, seat]);

  // Pod pools for the admin-only pool selector — clients never see it, so don't fetch.
  const poolsQ = useQuery({ queryKey: ["seat-pools"], queryFn: Pools.listForSeat, enabled: isAdmin });
  const pools = poolsQ.data ?? [];

  const save = useMutation({
    mutationFn: () => {
      const { assistantId, flowId } = decodeAgent(d.agent);
      const ami: SeatAmiInput | null = d.amiEnabled
        ? { host: d.ami.host.trim(), port: d.ami.port, user: d.ami.user.trim(),
            secret: d.ami.secret }
        : null;
      const body = {
        name: d.name.trim(),
        assistantId, flowId,
        maxConcurrent: d.maxConcurrent,
        active: d.active,
        amdEnabled: d.amdEnabled,
        notes: d.notes,
        transferTargets: d.transferTargets.filter((t) => t.label.trim() && t.value.trim()),
        ami,
        sipEnabled: d.sipEnabled,
        returnTarget: d.returnTarget.trim() || null,
        poolId: d.poolId || null,
      };
      return seat ? Seats.update(seat.id, body) : Seats.create(body);
    },
    onSuccess: () => {
      toast.success(seat ? "Seat updated" : "Seat created");
      onOpenChange(false);
      onSaved();
    },
    onError: (e) => toastApiError(e),
  });

  const addTarget = () =>
    setD((p) => ({ ...p, transferTargets: [...p.transferTargets, { label: "", value: "" }] }));
  const setTarget = (i: number, patch: Partial<SeatTransferTarget>) =>
    setD((p) => ({
      ...p,
      transferTargets: p.transferTargets.map((t, j) => (j === i ? { ...t, ...patch } : t)),
    }));
  const removeTarget = (i: number) =>
    setD((p) => ({ ...p, transferTargets: p.transferTargets.filter((_, j) => j !== i) }));

  const canSave = d.name.trim().length > 0 && d.agent.length > 0 &&
    (!d.amiEnabled || (d.ami.host.trim() && d.ami.user.trim()));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{seat ? "Edit seat" : "New bot seat"}</DialogTitle>
          <DialogDescription>
            A seat connects your VICIdial dialer to one AI bot, one call at a time. Pick the
            bot, choose how the dialer connects, then wire it up from the seat&apos;s card.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Name</label>
            <Input value={d.name} onChange={(e) => setD((p) => ({ ...p, name: e.target.value }))}
              placeholder="e.g. Acme Call Center — Lead Qual" />
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium">Agent</label>
            <Select value={d.agent || null} onValueChange={(v) => setD((p) => ({ ...p, agent: v ?? "" }))}>
              <SelectTrigger>
                <SelectValue placeholder="Pick an assistant or flow" />
              </SelectTrigger>
              <SelectContent>
                {/* Grouped so the two kinds read as distinct sections, not one long
                    prefixed list — quicker to scan when a client has many of each. */}
                {assistants.length > 0 && (
                  <SelectGroup>
                    <SelectLabel>Assistants</SelectLabel>
                    {assistants.map((a) => (
                      <SelectItem key={`a:${a.id}`} value={`a:${a.id}`}>{a.name}</SelectItem>
                    ))}
                  </SelectGroup>
                )}
                {flows.length > 0 && (
                  <SelectGroup>
                    <SelectLabel>Flows</SelectLabel>
                    {flows.map((f) => (
                      <SelectItem key={`f:${f.id}`} value={`f:${f.id}`}>{f.name}</SelectItem>
                    ))}
                  </SelectGroup>
                )}
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center gap-4">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Concurrent calls</label>
              <Input type="number" min={1} max={100} value={d.maxConcurrent}
                onChange={(e) => setD((p) => ({ ...p, maxConcurrent: Math.max(1, Number(e.target.value) || 1) }))}
                className="w-28" />
            </div>
            <div className="flex items-center gap-2 pt-6">
              <Switch checked={d.active} onCheckedChange={(v) => setD((p) => ({ ...p, active: v }))} />
              <span className="text-sm">Active</span>
            </div>
          </div>

          {/* Machine & menu detection */}
          <div className="flex items-center justify-between rounded-lg border p-3">
            <div>
              <p className="text-sm font-medium">Detect machines &amp; menus</p>
              <p className="text-xs text-muted-foreground">
                Hang up on voicemail and navigate phone menus automatically. Turn off if
                your dialer already screens answering machines.
              </p>
            </div>
            <Switch checked={d.amdEnabled}
              onCheckedChange={(v) => setD((p) => ({ ...p, amdEnabled: v }))} />
          </div>

          {/* Transfer targets */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium">Transfer targets</label>
              <Button type="button" variant="ghost" size="sm" onClick={addTarget}>
                <PlusIcon className="size-3.5" /> Add
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Named destinations the AI can transfer a caller to. The{" "}
              <span className="font-medium">value</span> is an in-group or extension on{" "}
              <span className="font-medium">your VICIdial</span> that rings a human agent
              (e.g. <span className="font-mono">8600051</span>); the AI dials it over your own
              trunk. The <span className="font-medium">label</span> (e.g. &ldquo;Sales&rdquo;)
              is what the AI matches the caller&apos;s intent against. Add one per destination,
              or leave this empty and set a single default below.
            </p>
            {d.transferTargets.map((t, i) => (
              <div key={i} className="flex items-center gap-2">
                <Input placeholder="Label (e.g. Sales)" value={t.label}
                  onChange={(e) => setTarget(i, { label: e.target.value })} />
                <Input placeholder="Value (e.g. 8600051)" value={t.value}
                  onChange={(e) => setTarget(i, { value: e.target.value })} />
                <Button type="button" variant="ghost" size="icon" className="text-destructive"
                  onClick={() => removeTarget(i)}>
                  <Trash2Icon className="size-4" />
                </Button>
              </div>
            ))}
          </div>

          {/* AMI (optional) */}
          <div className="space-y-2 rounded-lg border p-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">AMI for DTMF (optional)</p>
                <p className="text-xs text-muted-foreground">
                  Lets the bot press IVR keys out-of-band (PlayDTMF). Skip it and the bot
                  falls back to in-band tones (needs a ulaw/alaw trunk).
                </p>
              </div>
              <Switch checked={d.amiEnabled}
                onCheckedChange={(v) => setD((p) => ({ ...p, amiEnabled: v }))} />
            </div>
            {d.amiEnabled && (
              <div className="grid grid-cols-2 gap-2 pt-1">
                <Input placeholder="Host / IP" value={d.ami.host}
                  onChange={(e) => setD((p) => ({ ...p, ami: { ...p.ami, host: e.target.value } }))} />
                <Input type="number" placeholder="Port" value={d.ami.port}
                  onChange={(e) => setD((p) => ({ ...p, ami: { ...p.ami, port: Number(e.target.value) || 5038 } }))} />
                <Input placeholder="Manager user" value={d.ami.user}
                  onChange={(e) => setD((p) => ({ ...p, ami: { ...p.ami, user: e.target.value } }))} />
                <Input type="password" placeholder={seat?.ami?.hasSecret ? "•••• (unchanged)" : "Secret"}
                  value={d.ami.secret}
                  onChange={(e) => setD((p) => ({ ...p, ami: { ...p.ami, secret: e.target.value } }))} />
              </div>
            )}
          </div>

          {/* Connection method — the ONE choice a client must make to wire their
              dialer. Two mutually-exclusive paths, not two stray toggles. */}
          <div className="space-y-2">
            <label id="conn-method-label" className="text-sm font-medium">How the dialer connects</label>
            <div className="grid grid-cols-2 gap-2" role="group" aria-labelledby="conn-method-label">
              <button type="button" aria-pressed={d.sipEnabled}
                onClick={() => setD((p) => ({ ...p, sipEnabled: true }))}
                className={cn("rounded-lg border p-3 text-left transition-colors",
                  d.sipEnabled ? "border-primary bg-primary/5 ring-1 ring-primary"
                    : "border-border hover:bg-muted/50")}>
                <span className="flex items-center gap-1.5 text-sm font-medium">
                  <CableIcon className="size-3.5" /> SIP trunk
                </span>
                <span className="mt-0.5 block text-xs text-muted-foreground">
                  Register a carrier in VICIdial. Works on any Asterisk, no scripting. Recommended.
                </span>
              </button>
              <button type="button" aria-pressed={!d.sipEnabled}
                onClick={() => setD((p) => ({ ...p, sipEnabled: false }))}
                className={cn("rounded-lg border p-3 text-left transition-colors",
                  !d.sipEnabled ? "border-primary bg-primary/5 ring-1 ring-primary"
                    : "border-border hover:bg-muted/50")}>
                <span className="flex items-center gap-1.5 text-sm font-medium">
                  <ServerIcon className="size-3.5" /> HTTP allocate
                </span>
                <span className="mt-0.5 block text-xs text-muted-foreground">
                  Your dialplan calls our API per call. For custom integrations.
                </span>
              </button>
            </div>
            {d.sipEnabled && (
              <div className="space-y-1.5 pt-1">
                <label className="text-sm font-medium">Agent extension for transfers</label>
                <Input placeholder="e.g. 8600051" value={d.returnTarget}
                  onChange={(e) => setD((p) => ({ ...p, returnTarget: e.target.value }))} />
                <p className="text-xs text-muted-foreground">
                  Where a transfer sends the caller: the in-group or extension on your VICIdial
                  that rings a human. The AI hands the live call here over your own trunk.{" "}
                  <span className="font-medium text-foreground">Required if this bot will
                  transfer</span> — leave blank only if it never does. Used as the default when
                  no named transfer target above matches.
                </p>
                {/* Concrete example so a non-technical operator knows what to type. */}
                <div className="rounded-md bg-muted/60 px-2.5 py-2 text-[11px] text-muted-foreground">
                  <span className="font-medium text-foreground">Example:</span> in VICIdial this is
                  your <span className="font-mono">In-Group ID</span> (like{" "}
                  <span className="font-mono">8600051</span>) or a dialable extension (like{" "}
                  <span className="font-mono">8368</span>) that routes to a live agent queue.
                </div>
              </div>
            )}
            <p className="text-xs text-muted-foreground">
              {d.sipEnabled
                ? "After saving, copy the carrier block from the seat card into VICIdial → Carriers."
                : "After saving, hand the allocate snippet on the seat card to your dialplan engineer."}
            </p>
          </div>

          {/* Pod pool — ADMIN ONLY. Infra (pods/pools) stays behind the admin wall;
              clients never see it. Lets an admin swap the underlying GPU pod without
              the client reconfiguring anything. */}
          {isAdmin && (
            <div className="space-y-1.5 rounded-lg border border-dashed p-3">
              <label className="flex items-center gap-1.5 text-sm font-medium">
                <ServerIcon className="size-3.5 text-muted-foreground" /> Pod pool
                <Badge variant="outline" className="ml-1 text-[10px]">Admin</Badge>
              </label>
              <Select
                value={d.poolId || NO_POOL}
                onValueChange={(v) =>
                  setD((p) => ({ ...p, poolId: v === NO_POOL ? "" : (v ?? "") }))}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_POOL}>Whole warm pool (default)</SelectItem>
                  {pools.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name} · {p.podCount} pod{p.podCount === 1 ? "" : "s"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Route this seat through a specific pool of GPU pods. The{" "}
                <span className="font-medium">warm pool</span> is the shared set of ready
                pods every seat falls back to — leave it on that unless you&apos;re pinning
                capacity.
              </p>
              {d.poolId && pools.find((p) => p.id === d.poolId)?.podCount === 0 && (
                <p className="flex items-center gap-1.5 text-xs text-amber-400">
                  <AlertTriangleIcon className="size-3.5 shrink-0" aria-hidden />
                  This pool has no pods yet — calls will fall back to the warm pool until you
                  add one on the Pools page.
                </p>
              )}
            </div>
          )}

          <div className="space-y-1.5">
            <label className="text-sm font-medium">Notes (optional)</label>
            <Textarea rows={2} value={d.notes}
              onChange={(e) => setD((p) => ({ ...p, notes: e.target.value }))}
              placeholder="e.g. VICIdial IP 203.0.113.7 · ViciBox 12" />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={save.isPending}>Cancel</Button>
          <Button onClick={() => save.mutate()} disabled={save.isPending || !canSave}>
            {save.isPending ? "Saving…" : seat ? "Save changes" : "Create seat"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AllocateSnippet({ seat }: { seat: BotSeat }) {
  const snippet = buildAllocateSnippet(seat, API_BASE);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(snippet);
      toast.success("Allocate command copied");
    } catch {
      toast.error("Could not copy");
    }
  };
  return (
    <div className="mt-2 rounded-md bg-muted/60 p-2">
      <div className="flex items-center justify-between">
        <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
          HTTP allocate — for your dialplan engineer
        </p>
        <Button variant="ghost" size="icon" className="size-6" onClick={copy}>
          <CopyIcon className="size-3.5" />
        </Button>
      </div>
      <p className="mt-1 text-[11px] text-muted-foreground">
        Your Asterisk dialplan calls this once per call to get a bot; the response says
        which server to bridge to. Needs an{" "}
        <Link href="/api-settings" className="font-medium text-primary underline-offset-2 hover:underline">
          API key
        </Link>.
      </p>
      <pre className="mt-1.5 overflow-x-auto whitespace-pre-wrap break-all text-[11px] text-muted-foreground">
        {snippet}
      </pre>
    </div>
  );
}

function ConnectDialerCard({ seat }: { seat: BotSeat }) {
  const qc = useQueryClient();
  const rotateMut = useMutation({
    mutationFn: () => Seats.rotateSip(seat.id),
    onSuccess: (data) => {
      toast.success("New password: " + data.sipPassword);
      qc.invalidateQueries({ queryKey: ["bot-seats"] });
    },
    onError: (e) => toastApiError(e),
  });

  if (!seat.sipEnabled) return null;
  const rows: [string, string][] = [
    ["Server", seat.sipServerHost ?? "(set SIP_SERVER_HOST)"],
    ["Username", seat.sipUsername ?? "—"],
    ["Password", seat.sipPassword ?? "•••••• (shown once — rotate to see a new one)"],
  ];
  const block = buildCarrierBlock(seat);
  const copy = async () => {
    try { await navigator.clipboard.writeText(block); toast.success("Carrier block copied"); }
    catch { toast.error("Could not copy"); }
  };
  return (
    <div className="mt-2 rounded-md bg-muted/60 p-3 space-y-2">
      <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
        Connect your dialer (VICIdial → Carriers)
      </p>
      <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
        {rows.map(([k, v]) => (
          <React.Fragment key={k}>
            <span className="text-muted-foreground">{k}</span>
            <span className="font-mono break-all">{v}</span>
          </React.Fragment>
        ))}
      </div>
      <div className="flex items-center gap-2">
        <Button variant="outline" size="sm" onClick={copy}>
          <CopyIcon className="size-3.5" /> Copy VICIdial carrier block
        </Button>
        <Button variant="ghost" size="sm" onClick={() => rotateMut.mutate()}
          disabled={rotateMut.isPending}>
          <RotateCcwIcon className="size-3.5" />
          {rotateMut.isPending ? "Rotating…" : "Rotate password"}
        </Button>
      </div>
      <p className="text-[11px] text-muted-foreground">
        Paste into VICIdial → Admin → Carriers, then dial this trunk from a campaign.{" "}
        <Link href="/seats/connect" className="font-medium text-primary underline-offset-2 hover:underline">
          Full step-by-step guide
        </Link>
      </p>
    </div>
  );
}

/** How a call reaches a bot, in the client's own words — the seat page's teacher.
 *  Four fixed stages; the seat is the one the client owns. */
function CallPathStrip() {
  const stages: { icon: typeof PhoneIncomingIcon; label: string; sub: string }[] = [
    { icon: PhoneIncomingIcon, label: "Your VICIdial", sub: "dials a lead" },
    { icon: CableIcon, label: "SIP trunk", sub: "carries the call" },
    { icon: ServerIcon, label: "Bot seat", sub: "one call = one seat" },
    { icon: BotIcon, label: "AI answers", sub: "on a ready server" },
  ];
  return (
    <div className="flex flex-wrap items-center gap-x-1 gap-y-2 rounded-lg border bg-muted/30 px-3 py-2.5">
      {stages.map((s, i) => (
        <React.Fragment key={s.label}>
          <div className="flex items-center gap-2">
            <span className="flex size-7 shrink-0 items-center justify-center rounded-md border border-border bg-background text-muted-foreground">
              <s.icon className="size-3.5" aria-hidden />
            </span>
            <div className="leading-tight">
              <p className="text-xs font-medium text-foreground">{s.label}</p>
              <p className="text-[11px] text-muted-foreground">{s.sub}</p>
            </div>
          </div>
          {i < stages.length - 1 && (
            <ChevronRightIcon className="hidden size-3.5 shrink-0 text-muted-foreground/60 sm:inline" aria-hidden />
          )}
        </React.Fragment>
      ))}
    </div>
  );
}

export default function SeatsPage() {
  const qc = useQueryClient();
  const onChanged = () => qc.invalidateQueries({ queryKey: ["bot-seats"] });
  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => setMounted(true), []);
  const isAdmin = mounted && getRole() === "admin";

  // Poll so the "in use" badge stays live while calls come and go.
  const { data: seats, isLoading } = useQuery<BotSeat[]>({
    queryKey: ["bot-seats"], queryFn: Seats.list, refetchInterval: 5000,
  });
  const { data: assistants } = useQuery<Assistant[]>({ queryKey: ["assistants"], queryFn: Assistants.list });
  const { data: flows } = useQuery<Flow[]>({ queryKey: ["flows"], queryFn: Flows.list });

  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<BotSeat | null>(null);

  const openCreate = () => { setEditing(null); setDialogOpen(true); };
  const openEdit = (s: BotSeat) => { setEditing(s); setDialogOpen(true); };

  const del = useMutation({
    mutationFn: (id: string) => Seats.remove(id),
    onSuccess: () => { toast.success("Seat deleted"); onChanged(); },
    onError: (e) => toastApiError(e),
  });
  const reset = useMutation({
    mutationFn: (id: string) => Seats.reset(id),
    onSuccess: () => { toast.success("Counter reset"); onChanged(); },
    onError: (e) => toastApiError(e),
  });

  const agentName = (s: BotSeat): string => {
    if (s.flowId) return flows?.find((f) => f.id === s.flowId)?.name ?? "Flow";
    if (s.assistantId) return assistants?.find((a) => a.id === s.assistantId)?.name ?? "Assistant";
    return "—";
  };

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">VICIdial</p>
          <h1 className="mt-0.5 text-base font-semibold text-foreground">Bot seats</h1>
          <p className="text-xs text-muted-foreground mt-0.5 max-w-prose">
            A seat connects your VICIdial dialer to one AI bot. One seat = one call at a time;
            buy more seats to run more calls at once. Create a seat, pick the bot, then connect
            your dialer with the details on its card.
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Button variant="outline" render={<Link href="/seats/connect" />}>
            <BookOpenIcon className="size-4" /> How to connect
          </Button>
          <Button onClick={openCreate}><PlusIcon className="size-4" />New seat</Button>
        </div>
      </div>

      <CallPathStrip />

      {isLoading ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-40 rounded-lg" />)}
        </div>
      ) : !seats || seats.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-14 text-center">
            <div className="flex size-10 items-center justify-center rounded-lg bg-muted">
              <ServerIcon className="size-5 text-muted-foreground" aria-hidden />
            </div>
            <div className="space-y-1">
              <p className="text-sm font-medium">No bot seats yet</p>
              <p className="text-xs text-muted-foreground max-w-xs">
                Create a seat, pick the assistant or flow that answers, then connect your
                VICIdial dialer with the SIP carrier details on the seat&apos;s card.
              </p>
            </div>
            <Button onClick={openCreate}><PlusIcon className="size-4" />New seat</Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {seats.map((s) => {
            const inUse = s.activeCalls > 0;
            return (
              <Card key={s.id} className="group relative">
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-foreground">{s.name}</p>
                      <p className="mt-0.5 truncate text-xs text-muted-foreground">
                        {s.flowId ? "Flow" : "Assistant"} · {agentName(s)}
                      </p>
                      <div className="mt-2 flex flex-wrap items-center gap-1.5">
                        {s.active
                          ? <SeatHealthBadge health={s.routeHealth} />
                          : <Badge variant="outline">Inactive</Badge>}
                        <Badge variant={inUse ? "default" : "secondary"}>
                          {s.activeCalls}/{s.maxConcurrent} in use
                        </Badge>
                        {s.ami?.hasSecret && <Badge variant="outline">AMI</Badge>}
                        {s.transferTargets.length > 0 && (
                          <Badge variant="outline">{s.transferTargets.length} transfer</Badge>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <Button variant="ghost" size="icon" onClick={() => openEdit(s)}>
                        <PencilIcon className="size-4" />
                      </Button>
                      <Button variant="ghost" size="icon" title="Reset counter"
                        onClick={() => reset.mutate(s.id)}>
                        <RotateCcwIcon className="size-4" />
                      </Button>
                      <AlertDialog>
                        <AlertDialogTrigger render={
                          <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive">
                            <Trash2Icon className="size-4" />
                          </Button>} />
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Delete &ldquo;{s.name}&rdquo;?</AlertDialogTitle>
                            <AlertDialogDescription>
                              The call center can no longer allocate calls against this seat.
                              This cannot be undone.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction onClick={() => del.mutate(s.id)}
                              className="bg-destructive text-white hover:bg-destructive/90">Delete</AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  </div>
                  <ConnectDialerCard seat={s} />
                  {!s.sipEnabled && <AllocateSnippet seat={s} />}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Keep the dialog always mounted (Base UI leaves the page inert if a
          controlled dialog is conditionally unmounted while open). */}
      <SeatDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        seat={editing}
        assistants={assistants ?? []}
        flows={flows ?? []}
        onSaved={onChanged}
        isAdmin={isAdmin}
      />
    </div>
  );
}
