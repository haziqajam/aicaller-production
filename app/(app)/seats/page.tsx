"use client";

import * as React from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { Seats, type BotSeat, type SeatTransferTarget, type SeatAmiInput } from "@/lib/api/seats";
import { Assistants, Flows } from "@/lib/api/resources";
import type { Assistant, Flow } from "@/lib/api/schemas";
import { toastApiError } from "@/lib/api/errors";
import { API_BASE } from "@/lib/api/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
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
} from "lucide-react";

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
  notes: string;
  transferTargets: SeatTransferTarget[];
  amiEnabled: boolean;
  ami: { host: string; port: number; user: string; secret: string };
  sipEnabled: boolean;
  returnTarget: string;
};

const EMPTY_DRAFT: Draft = {
  name: "", agent: "", maxConcurrent: 1, active: true, notes: "",
  transferTargets: [],
  amiEnabled: false,
  ami: { host: "", port: 5038, user: "", secret: "" },
  sipEnabled: false,
  returnTarget: "",
};

function SeatDialog({
  open, onOpenChange, seat, assistants, flows, onSaved,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  seat: BotSeat | null;               // null = create
  assistants: Assistant[];
  flows: Flow[];
  onSaved: () => void;
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
      });
    } else {
      setD(EMPTY_DRAFT);
    }
  }, [open, seat]);

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
        notes: d.notes,
        transferTargets: d.transferTargets.filter((t) => t.label.trim() && t.value.trim()),
        ami,
        sipEnabled: d.sipEnabled,
        returnTarget: d.returnTarget.trim() || null,
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
            A seat lets a call center&apos;s VICIdial dialer connect one concurrent call to
            this bot over AudioSocket. Buy N seats for N concurrent calls.
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
                {assistants.map((a) => (
                  <SelectItem key={`a:${a.id}`} value={`a:${a.id}`}>Assistant · {a.name}</SelectItem>
                ))}
                {flows.map((f) => (
                  <SelectItem key={`f:${f.id}`} value={`f:${f.id}`}>Flow · {f.name}</SelectItem>
                ))}
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

          {/* Transfer targets */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium">Transfer targets</label>
              <Button type="button" variant="ghost" size="sm" onClick={addTarget}>
                <PlusIcon className="size-3.5" /> Add
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Where the AI hands a qualified caller. The <span className="font-medium">value</span> is
              an in-group / extension YOUR dialplan routes on (the bot writes it as the transfer outcome).
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

          {/* SIP access */}
          <div className="space-y-2 rounded-lg border p-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">SIP access (VICIdial)</p>
                <p className="text-xs text-muted-foreground">
                  Let the call center connect this bot with a SIP carrier — no scripts,
                  works on any Asterisk. We generate the login automatically.
                </p>
              </div>
              <Switch checked={d.sipEnabled}
                onCheckedChange={(v) => setD((p) => ({ ...p, sipEnabled: v }))} />
            </div>
            {d.sipEnabled && (
              <Input placeholder="Transfer to (their in-group, optional)" value={d.returnTarget}
                onChange={(e) => setD((p) => ({ ...p, returnTarget: e.target.value }))} />
            )}
          </div>

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
  const snippet =
    `curl -s -X POST "${API_BASE}/audiosocket/allocate" \\\n` +
    `  -H "X-API-Key: <YOUR_API_KEY>" -H "Content-Type: application/json" \\\n` +
    `  -d '{"seatId":"${seat.id}","fromNumber":"<LEAD_PHONE>","channel":"<ASTERISK_CHANNEL>"}'`;
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
          Dialer allocate call
        </p>
        <Button variant="ghost" size="icon" className="size-6" onClick={copy}>
          <CopyIcon className="size-3.5" />
        </Button>
      </div>
      <pre className="mt-1 overflow-x-auto whitespace-pre-wrap break-all text-[11px] text-muted-foreground">
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
  const pw = seat.sipPassword ?? "<password>";
  const rows: [string, string][] = [
    ["Server", seat.sipServerHost ?? "(set SIP_SERVER_HOST)"],
    ["Username", seat.sipUsername ?? "—"],
    ["Password", seat.sipPassword ?? "•••••• (shown once — rotate to see a new one)"],
  ];
  const block =
    `; AIDEVGEN AI bot trunk\n` +
    `register => ${seat.sipUsername}:${pw}@${seat.sipServerHost}\n` +
    `[aidevgen]\ntype=peer\nhost=${seat.sipServerHost}\nusername=${seat.sipUsername}\n` +
    `fromuser=${seat.sipUsername}\nsecret=${pw}\ndisallow=all\nallow=ulaw\n`;
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
        Paste into VICIdial → Admin → Carriers, then dial this trunk from a campaign.
      </p>
    </div>
  );
}

export default function SeatsPage() {
  const qc = useQueryClient();
  const onChanged = () => qc.invalidateQueries({ queryKey: ["bot-seats"] });

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
      <div className="flex items-center justify-between">
        <div>
          <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Run</p>
          <h1 className="mt-0.5 text-base font-semibold text-foreground">Bot seats</h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Let a call center&apos;s own VICIdial dialer connect calls to your bots over AudioSocket.
            Each seat = one concurrent call; give them an API key and the allocate snippet below.
          </p>
        </div>
        <Button onClick={openCreate}><PlusIcon className="size-4" />New seat</Button>
      </div>

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
                Create a seat, bind it to an assistant or flow, then share the allocate snippet
                and an API key with the call center running VICIdial.
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
                        <Badge variant={inUse ? "default" : "secondary"}>
                          {s.activeCalls}/{s.maxConcurrent} in use
                        </Badge>
                        {!s.active && <Badge variant="outline">Inactive</Badge>}
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
      />
    </div>
  );
}
