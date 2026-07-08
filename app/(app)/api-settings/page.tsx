"use client";

import * as React from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { ApiKeys, type ApiKey } from "@/lib/api/resources";
import { toastApiError } from "@/lib/api/errors";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { KeyRoundIcon, CopyIcon, CheckIcon, Trash2Icon, ShieldAlertIcon } from "lucide-react";

/* ─── helpers ────────────────────────────────────────────────── */

// Expiry presets → an ISO timestamp (or null for "never"), computed client-side.
const EXPIRY_OPTIONS = [
  { value: "never", label: "Never" },
  { value: "30", label: "30 days" },
  { value: "90", label: "90 days" },
  { value: "365", label: "1 year" },
] as const;
const expiryItems = Object.fromEntries(EXPIRY_OPTIONS.map((o) => [o.value, o.label]));

function expiryToIso(value: string): string | null {
  if (value === "never") return null;
  const days = Number(value);
  return new Date(Date.now() + days * 86_400_000).toISOString();
}

function suggestName(): string {
  // Auto-generated, friendly default the user can keep or overwrite.
  return `key-${Math.random().toString(36).slice(2, 8)}`;
}

function fmtDate(iso?: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return "—";
  }
}

function keyState(k: ApiKey): { label: string; tone: "revoked" | "expired" | "active" } {
  if (k.revoked) return { label: "Revoked", tone: "revoked" };
  if (k.expiresAt && new Date(k.expiresAt).getTime() <= Date.now())
    return { label: "Expired", tone: "expired" };
  return { label: "Active", tone: "active" };
}

/* ─── one-time reveal dialog ─────────────────────────────────── */

function RevealDialog({
  secret,
  onClose,
}: {
  secret: string | null;
  onClose: () => void;
}) {
  const [copied, setCopied] = React.useState(false);
  const copy = async () => {
    if (!secret) return;
    await navigator.clipboard.writeText(secret);
    setCopied(true);
    toast.success("API key copied to clipboard");
  };
  return (
    <Dialog open={!!secret} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Copy your API key</DialogTitle>
          <DialogDescription>
            This is the only time the full key is shown. Store it somewhere safe
            — you won&apos;t be able to see it again.
          </DialogDescription>
        </DialogHeader>
        <div className="flex items-center gap-2 rounded-md border border-border bg-muted/40 p-2">
          <button
            type="button"
            onClick={copy}
            title="Click to copy"
            className="min-w-0 flex-1 cursor-pointer break-all text-left font-mono text-sm leading-snug outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring rounded-sm"
          >
            {secret}
          </button>
          <Button type="button" size="sm" variant="outline" onClick={copy} className="shrink-0 self-center">
            {copied ? <CheckIcon className="size-4" /> : <CopyIcon className="size-4" />}
            {copied ? "Copied" : "Copy"}
          </Button>
        </div>
        <DialogFooter>
          <Button type="button" onClick={onClose}>
            Done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ─── create dialog ──────────────────────────────────────────── */

function CreateKeyDialog({ onCreated }: { onCreated: (secret: string) => void }) {
  const qc = useQueryClient();
  const [open, setOpen] = React.useState(false);
  const [name, setName] = React.useState("");
  const [expiry, setExpiry] = React.useState<string>("never");

  // Seed a fresh suggested name + default expiry when opening the dialog. Done
  // here (the only open path) rather than in an effect.
  const openDialog = () => {
    setName(suggestName());
    setExpiry("never");
    setOpen(true);
  };

  const create = useMutation({
    mutationFn: () =>
      ApiKeys.create({ name: name.trim() || undefined, expiresAt: expiryToIso(expiry) }),
    onSuccess: (res) => {
      setOpen(false);
      qc.invalidateQueries({ queryKey: ["api-keys"] });
      onCreated(res.key);
    },
    onError: (e) => toastApiError(e),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button onClick={openDialog}>
        <KeyRoundIcon className="size-4" />
        Create API key
      </Button>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create API key</DialogTitle>
          <DialogDescription>
            Use this key to call the API with the <code>X-API-Key</code> header.
            It acts as you, with regular user access.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Name</label>
            <div className="flex gap-2">
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. production server"
              />
              <Button type="button" variant="outline" onClick={() => setName(suggestName())}>
                Generate
              </Button>
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium">Expiry</label>
            <Select items={expiryItems} value={expiry} onValueChange={(v) => setExpiry(v as string)}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Never" />
              </SelectTrigger>
              <SelectContent>
                {EXPIRY_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => setOpen(false)}
            disabled={create.isPending}
          >
            Cancel
          </Button>
          <Button type="button" onClick={() => create.mutate()} disabled={create.isPending}>
            {create.isPending ? "Creating…" : "Create key"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ─── page ───────────────────────────────────────────────────── */

export default function ApiSettingsPage() {
  const qc = useQueryClient();
  const [secret, setSecret] = React.useState<string | null>(null);

  const { data: keys, isLoading } = useQuery<ApiKey[]>({
    queryKey: ["api-keys"],
    queryFn: ApiKeys.list,
  });

  const revoke = useMutation({
    mutationFn: (id: string) => ApiKeys.revoke(id),
    onSuccess: () => {
      toast.success("API key revoked");
      qc.invalidateQueries({ queryKey: ["api-keys"] });
    },
    onError: (e) => toastApiError(e),
  });

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-base font-semibold text-foreground">
            <KeyRoundIcon className="size-4 text-primary" aria-hidden />
            API keys
          </h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Programmatic access to the API. Send your key in the{" "}
            <code>X-API-Key</code> header. Keys act as you with regular user
            access and can be given an expiry.
          </p>
        </div>
        <CreateKeyDialog onCreated={setSecret} />
      </div>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="space-y-2 p-4">
              <Skeleton className="h-9 w-full" />
              <Skeleton className="h-9 w-full" />
            </div>
          ) : !keys || keys.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 py-14 text-center">
              <ShieldAlertIcon className="size-5 text-muted-foreground" aria-hidden />
              <p className="text-sm text-muted-foreground">
                No API keys yet. Create one to call the API without signing in.
              </p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Key</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead>Expires</TableHead>
                  <TableHead>Last used</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {keys.map((k) => {
                  const st = keyState(k);
                  return (
                    <TableRow key={k.id}>
                      <TableCell className="font-medium">{k.name}</TableCell>
                      <TableCell className="font-mono text-xs text-muted-foreground">
                        {k.hint}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={st.tone === "active" ? "default" : "secondary"}
                          className={
                            st.tone === "active"
                              ? ""
                              : "text-muted-foreground"
                          }
                        >
                          {st.label}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {fmtDate(k.createdAt)}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {fmtDate(k.expiresAt)}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {fmtDate(k.lastUsedAt)}
                      </TableCell>
                      <TableCell className="text-right">
                        {!k.revoked && (
                          <AlertDialog>
                            <AlertDialogTrigger
                              render={
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="text-destructive hover:text-destructive"
                                >
                                  <Trash2Icon className="size-4" />
                                </Button>
                              }
                            />
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Revoke this API key?</AlertDialogTitle>
                                <AlertDialogDescription>
                                  Any service using <span className="font-mono">{k.hint}</span>{" "}
                                  will immediately stop working. This can&apos;t be undone.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <AlertDialogAction
                                  onClick={() => revoke.mutate(k.id)}
                                  className="bg-destructive text-white hover:bg-destructive/90"
                                >
                                  Revoke
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <RevealDialog secret={secret} onClose={() => setSecret(null)} />
    </div>
  );
}
