"use client";

import * as React from "react";
import Link from "next/link";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { NumberLists, Numbers } from "@/lib/api/resources";
import type { NumberList } from "@/lib/api/schemas";
import { toastApiError } from "@/lib/api/errors";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { BuyNumberDialog } from "@/components/numbers/buy-number-dialog";
import { ImportNumbersDialog } from "@/components/numbers/import-numbers-dialog";
import { cn } from "@/lib/utils";
import {
  ArrowLeftIcon, ListChecksIcon, PhoneIcon, PhoneIncomingIcon, Trash2Icon,
} from "lucide-react";

/* ─── Types & helpers (shared shape with the global numbers view) ─────────── */

type Caps =
  | { voice?: boolean; sms?: boolean; mms?: boolean; fax?: boolean }
  | string[] | null | undefined;

interface NumberRecord {
  id: string;
  phoneNumber?: string;
  phone_number?: string;
  friendlyName?: string;
  friendly_name?: string;
  isoCountry?: string | null;
  region?: string | null;
  locality?: string | null;
  capabilities?: Caps;
  assistantId?: string | null;
  assistantName?: string | null;
}

const COUNTRY_NAMES: Record<string, string> = {
  US: "United States", CA: "Canada", GB: "United Kingdom", AU: "Australia",
  DE: "Germany", FR: "France", PK: "Pakistan",
};

function flagEmoji(iso?: string | null): string {
  if (!iso || iso.length !== 2) return "🌐";
  const cc = iso.toUpperCase();
  const A = 0x1f1e6;
  return String.fromCodePoint(A + cc.charCodeAt(0) - 65, A + cc.charCodeAt(1) - 65);
}

function normCaps(c: Caps): { voice: boolean; sms: boolean; mms: boolean } {
  if (Array.isArray(c)) return { voice: c.includes("voice"), sms: c.includes("sms"), mms: c.includes("mms") };
  if (c && typeof c === "object") return { voice: !!c.voice, sms: !!c.sms, mms: !!c.mms };
  return { voice: false, sms: false, mms: false };
}

function numberLabel(n: NumberRecord): string {
  return n.friendlyName ?? n.friendly_name ?? n.phoneNumber ?? n.phone_number ?? n.id;
}

function CapBadge({ label, on }: { label: string; on: boolean }) {
  return (
    <span className={cn(
      "tabular inline-flex items-center rounded-full border px-1.5 py-0.5 text-[10px] font-medium",
      on ? "border-success/25 bg-success/12 text-success"
         : "border-border bg-muted/40 text-muted-foreground/60 line-through",
    )}>{label}</span>
  );
}

/* ─── Release (the ONLY way a number leaves a list) ───────────────────────── */

function ReleaseControl({ ids, listId, compact, onDone }: {
  ids: string[]; listId: string; compact?: boolean; onDone?: () => void;
}) {
  const qc = useQueryClient();
  const [open, setOpen] = React.useState(false);
  const count = ids.length;
  const release = useMutation({
    mutationFn: () => Numbers.releaseMany(ids),
    onSuccess: (res) => {
      const n = res.releasedCount ?? res.released.length;
      if (res.failed?.length) toast.warning(`Released ${n}, ${res.failed.length} failed`, { description: res.failed[0]?.error });
      else toast.success(`Released ${n} number${n !== 1 ? "s" : ""}`);
      qc.invalidateQueries({ queryKey: ["numbers"] });
      qc.invalidateQueries({ queryKey: ["number-list", listId] });
      qc.invalidateQueries({ queryKey: ["number-lists"] });
      setOpen(false); onDone?.();
    },
    onError: (err) => toastApiError(err, "Couldn't release number"),
  });

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger render={
        compact
          ? <Button variant="ghost" size="icon-sm" aria-label="Release number" className="text-muted-foreground hover:text-destructive" />
          : <Button variant="destructive" size="sm" />
      }>
        <Trash2Icon className="size-4" aria-hidden />
        {!compact && <>Release{count > 1 ? ` (${count})` : ""}</>}
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Release {count} number{count !== 1 ? "s" : ""}?</AlertDialogTitle>
          <AlertDialogDescription>
            This permanently releases the number{count !== 1 ? "s" : ""} back to Twilio and stops billing. It is removed from your account and this list. This cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction variant="destructive" onClick={() => release.mutate()} disabled={release.isPending}>
            {release.isPending ? "Releasing…" : "Release"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

/* ─── Page ────────────────────────────────────────────────────────────────── */

export default function NumberListDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = React.use(params);
  const qc = useQueryClient();
  const [selected, setSelected] = React.useState<Set<string>>(new Set());

  const { data: list } = useQuery<NumberList>({
    queryKey: ["number-list", id], queryFn: () => NumberLists.get(id),
  });
  const { data: allNumbers, isLoading } = useQuery<NumberRecord[]>({
    queryKey: ["numbers"], queryFn: Numbers.list,
  });

  // Members = the list's numberIds resolved to their rich docs, in stored order.
  const byId = React.useMemo(() => {
    const m = new Map<string, NumberRecord>();
    for (const n of allNumbers ?? []) m.set(n.id, n);
    return m;
  }, [allNumbers]);
  const items = React.useMemo(
    () => (list?.numberIds ?? []).map((nid) => byId.get(nid)).filter(Boolean) as NumberRecord[],
    [list, byId],
  );

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["number-list", id] });
    qc.invalidateQueries({ queryKey: ["number-lists"] });
    qc.invalidateQueries({ queryKey: ["numbers"] });
  };
  const clearSelection = () => setSelected(new Set());

  const allSelected = items.length > 0 && items.every((m) => selected.has(m.id));
  const someSelected = items.some((m) => selected.has(m.id));
  const toggleAll = (on: boolean) => setSelected(on ? new Set(items.map((m) => m.id)) : new Set());
  const toggleOne = (mid: string, on: boolean) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (on) next.add(mid); else next.delete(mid);
      return next;
    });
  const selectedIds = Array.from(selected);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <Link href="/numbers" className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
            <ArrowLeftIcon className="size-3.5" />Number lists
          </Link>
          <h1 className="mt-1 flex items-center gap-2 text-base font-semibold text-foreground">
            <ListChecksIcon className="size-4 text-primary" />
            {list?.name ?? "List"}
            <span className="text-xs font-normal text-muted-foreground">({items.length})</span>
          </h1>
        </div>
        <div className="flex items-center gap-2">
          {selectedIds.length > 0 && (
            <>
              <span className="text-xs text-muted-foreground">{selectedIds.length} selected</span>
              <ReleaseControl ids={selectedIds} listId={id} onDone={clearSelection} />
            </>
          )}
          <ImportNumbersDialog listId={id} onImported={refresh} />
          <BuyNumberDialog listId={id} onBought={refresh} />
        </div>
      </div>

      {isLoading ? (
        <Skeleton className="h-64 rounded-lg" />
      ) : items.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-14 text-center">
            <div className="flex size-10 items-center justify-center rounded-lg bg-muted">
              <PhoneIcon className="size-5 text-muted-foreground" />
            </div>
            <div className="space-y-1">
              <p className="text-sm font-medium">No numbers in this list</p>
              <p className="text-xs text-muted-foreground max-w-xs">Buy a number to provision it straight into this list. Releasing a number (here or by deleting the list) gives it back to Twilio.</p>
            </div>
            <BuyNumberDialog listId={id} onBought={refresh} />
          </CardContent>
        </Card>
      ) : (
        <div className="overflow-hidden rounded-lg border border-border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-8">
                  <Checkbox checked={allSelected} indeterminate={someSelected && !allSelected}
                    onCheckedChange={(c) => toggleAll(!!c)} aria-label="Select all" />
                </TableHead>
                <TableHead className="text-[10px] uppercase tracking-wider text-muted-foreground">Number</TableHead>
                <TableHead className="text-[10px] uppercase tracking-wider text-muted-foreground">Location</TableHead>
                <TableHead className="text-[10px] uppercase tracking-wider text-muted-foreground">Capabilities</TableHead>
                <TableHead className="text-[10px] uppercase tracking-wider text-muted-foreground">Inbound</TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((n) => {
                const caps = normCaps(n.capabilities);
                const country = n.isoCountry ? COUNTRY_NAMES[n.isoCountry.toUpperCase()] ?? n.isoCountry : null;
                const sub = [n.region, n.locality].filter(Boolean).join(" · ");
                return (
                  <TableRow key={n.id} data-state={selected.has(n.id) ? "selected" : undefined}
                    className="transition-colors duration-150 hover:bg-muted/30">
                    <TableCell className="w-8">
                      <Checkbox checked={selected.has(n.id)} onCheckedChange={(c) => toggleOne(n.id, !!c)}
                        aria-label={`Select ${numberLabel(n)}`} />
                    </TableCell>
                    <TableCell className="tabular text-sm font-medium text-foreground">{numberLabel(n)}</TableCell>
                    <TableCell>
                      {country ? (
                        <div className="flex flex-col">
                          <span className="flex items-center gap-1.5 text-sm text-foreground">
                            <span aria-hidden>{flagEmoji(n.isoCountry)}</span>{country}
                          </span>
                          {sub && <span className="text-[11px] text-muted-foreground">{sub}</span>}
                        </div>
                      ) : <span className="text-xs text-muted-foreground">Unknown</span>}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <CapBadge label="Voice" on={caps.voice} />
                        <CapBadge label="SMS" on={caps.sms} />
                        <CapBadge label="MMS" on={caps.mms} />
                      </div>
                    </TableCell>
                    <TableCell>
                      {n.assistantId ? (
                        <span className="inline-flex max-w-[12rem] items-center gap-1 truncate rounded-full border border-primary/25 bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">
                          <PhoneIncomingIcon className="size-3 shrink-0" aria-hidden />
                          <span className="truncate">{n.assistantName ?? "Routed"}</span>
                        </span>
                      ) : <span className="text-[11px] text-muted-foreground">Unrouted</span>}
                    </TableCell>
                    <TableCell className="text-right">
                      <ReleaseControl ids={[n.id]} listId={id} compact />
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
