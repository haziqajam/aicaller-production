"use client";

import * as React from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { TwilioPresets, type TwilioPreset } from "@/lib/api/twilio-presets";
import { toastApiError } from "@/lib/api/errors";
import { PresetDialog } from "@/components/twilio/preset-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  KeyRoundIcon, PlusIcon, PencilIcon, Trash2Icon, CheckIcon, PhoneIcon,
} from "lucide-react";

function maskSid(sid?: string | null): string {
  if (!sid) return "—";
  return sid.length <= 6 ? sid : `${sid.slice(0, 2)}••••${sid.slice(-4)}`;
}

export default function TwilioSettingsPage() {
  const qc = useQueryClient();
  const { data: presets, isLoading } = useQuery<TwilioPreset[]>({
    queryKey: ["twilio-presets"],
    queryFn: TwilioPresets.list,
  });
  const list = presets ?? [];

  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<TwilioPreset | undefined>(undefined);
  const [toDelete, setToDelete] = React.useState<TwilioPreset | null>(null);

  const activate = useMutation({
    mutationFn: (id: string) => TwilioPresets.activate(id),
    onSuccess: () => {
      toast.success("Active account switched");
      qc.invalidateQueries({ queryKey: ["twilio-presets"] });
      qc.invalidateQueries({ queryKey: ["numbers"] });
      qc.invalidateQueries({ queryKey: ["number-lists"] });
    },
    onError: (err) => toastApiError(err, "Couldn't switch account"),
  });

  const remove = useMutation({
    mutationFn: (id: string) => TwilioPresets.remove(id),
    onSuccess: () => {
      toast.success("Account removed");
      qc.invalidateQueries({ queryKey: ["twilio-presets"] });
      setToDelete(null);
    },
    onError: (err) => { toastApiError(err, "Couldn't remove account"); setToDelete(null); },
  });

  function openCreate() { setEditing(undefined); setDialogOpen(true); }
  function openEdit(p: TwilioPreset) { setEditing(p); setDialogOpen(true); }

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-primary/30 bg-primary/10 text-primary">
            <KeyRoundIcon className="size-4" aria-hidden />
          </span>
          <div>
            <h1 className="text-base font-semibold text-foreground">Twilio accounts</h1>
            <p className="mt-1 text-xs text-muted-foreground">
              Each account holds its own Twilio credentials. The <span className="font-medium text-foreground">active</span> account
              drives your numbers, campaigns, and calls. Switch it any time from the navbar.
            </p>
          </div>
        </div>
        <Button onClick={openCreate}><PlusIcon className="size-4" aria-hidden />Add account</Button>
      </div>

      {isLoading ? (
        <Skeleton className="h-40 rounded-lg" />
      ) : list.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-14 text-center">
            <div className="flex size-10 items-center justify-center rounded-lg bg-muted">
              <KeyRoundIcon className="size-5 text-muted-foreground" aria-hidden />
            </div>
            <div className="space-y-1">
              <p className="text-sm font-medium">No Twilio accounts yet</p>
              <p className="max-w-xs text-xs text-muted-foreground">
                Add your Twilio credentials to list numbers, buy/import numbers, and run campaigns.
              </p>
            </div>
            <Button onClick={openCreate}><PlusIcon className="size-4" aria-hidden />Add account</Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {list.map((p) => (
            <Card key={p.id} className={p.active ? "border-primary/40" : undefined}>
              <CardContent className="flex items-center gap-3 py-3">
                <span className={`size-2 shrink-0 rounded-full ${p.active ? "bg-emerald-400" : "bg-muted-foreground/40"}`} aria-hidden />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-sm font-medium text-foreground">{p.name}</span>
                    {p.active && <Badge variant="default" className="text-[10px]">Active</Badge>}
                  </div>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground">
                    <span className="tabular">{maskSid(p.accountSid)}</span>
                    {p.phoneNumber && <span className="tabular inline-flex items-center gap-1"><PhoneIcon className="size-3" aria-hidden />{p.phoneNumber}</span>}
                    <span>{p.hasToken ? "token ••••" : "no token"}</span>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  {!p.active && (
                    <Button variant="outline" size="sm" onClick={() => activate.mutate(p.id)}
                      disabled={activate.isPending}>
                      <CheckIcon className="size-3.5" aria-hidden />Set active
                    </Button>
                  )}
                  <Button variant="ghost" size="icon-sm" aria-label="Edit account" onClick={() => openEdit(p)}>
                    <PencilIcon className="size-4" aria-hidden />
                  </Button>
                  <Button variant="ghost" size="icon-sm" aria-label="Remove account"
                    className="text-muted-foreground hover:text-destructive" onClick={() => setToDelete(p)}>
                    <Trash2Icon className="size-4" aria-hidden />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Always-mounted controlled dialogs */}
      <PresetDialog open={dialogOpen} onOpenChange={setDialogOpen} preset={editing}
        onSaved={() => qc.invalidateQueries({ queryKey: ["twilio-presets"] })} />

      <AlertDialog open={toDelete !== null} onOpenChange={(v) => !v && setToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove “{toDelete?.name}”?</AlertDialogTitle>
            <AlertDialogDescription>
              This deletes the stored credentials. Numbers and running campaigns using this
              account block removal until they’re released/finished. This can’t be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction variant="destructive"
              onClick={() => toDelete && remove.mutate(toDelete.id)} disabled={remove.isPending}>
              {remove.isPending ? "Removing…" : "Remove"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
