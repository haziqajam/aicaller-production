"use client";

import * as React from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { TwilioPresets, type TwilioPreset } from "@/lib/api/twilio-presets";
import { toastApiError } from "@/lib/api/errors";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Loader2Icon, KeyRoundIcon } from "lucide-react";

const SENTINEL = "***"; // edit mode: keep the stored token unless changed

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="text-sm font-medium">{label}</label>
      {children}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

/**
 * Create / edit a Twilio credential preset. Controlled + always-mounted (Base UI
 * dialogs must stay mounted or the page goes inert). The auth token is masked: on
 * edit it seeds "***", and we only send it when the admin actually typed a new one.
 * Saving verifies the credentials against Twilio (backend) — failures keep the
 * dialog open with the error.
 */
export function PresetDialog({
  open, onOpenChange, preset, onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  preset?: TwilioPreset;
  onSaved?: () => void;
}) {
  const qc = useQueryClient();
  const editing = Boolean(preset);

  const [name, setName] = React.useState("");
  const [accountSid, setAccountSid] = React.useState("");
  const [authToken, setAuthToken] = React.useState("");
  const [phoneNumber, setPhoneNumber] = React.useState("");

  // Seed the form on each open transition (render-time sync, not an effect).
  const [prevOpen, setPrevOpen] = React.useState(false);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) {
      setName(preset?.name ?? "");
      setAccountSid(preset?.accountSid ?? "");
      setAuthToken(editing ? SENTINEL : "");
      setPhoneNumber(preset?.phoneNumber ?? "");
    }
  }

  const save = useMutation({
    mutationFn: () => {
      if (editing && preset) {
        const body: Record<string, unknown> = {
          name: name.trim(), accountSid: accountSid.trim(),
          phoneNumber: phoneNumber.trim() || null,
        };
        // Only send the token when it was actually changed from the sentinel.
        if (authToken && authToken !== SENTINEL) body.authToken = authToken;
        return TwilioPresets.update(preset.id, body);
      }
      return TwilioPresets.create({
        name: name.trim(), accountSid: accountSid.trim(),
        authToken, phoneNumber: phoneNumber.trim() || null,
      });
    },
    onSuccess: () => {
      toast.success(editing ? "Account updated" : "Account added");
      qc.invalidateQueries({ queryKey: ["twilio-presets"] });
      // An edited active account changes which creds numbers resolve under.
      if (editing && preset?.active) qc.invalidateQueries({ queryKey: ["numbers"] });
      onSaved?.();
      onOpenChange(false);
    },
    onError: (err) => toastApiError(err, "Couldn't verify Twilio credentials"),
  });

  const tokenChanged = authToken !== "" && authToken !== SENTINEL;
  const canSave = Boolean(name.trim()) && Boolean(accountSid.trim())
    && (editing ? true : Boolean(authToken)) && !save.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <KeyRoundIcon className="size-4 text-primary" aria-hidden />
            {editing ? "Edit Twilio account" : "Add Twilio account"}
          </DialogTitle>
          <DialogDescription>
            Credentials are verified with Twilio and stored encrypted. The auth token
            is never shown again after saving.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <Field label="Name" hint="A label you'll recognize, e.g. “Production” or a client name.">
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Production" />
          </Field>
          <Field label="Account SID">
            <Input className="tabular" value={accountSid} placeholder="AC…"
              onChange={(e) => setAccountSid(e.target.value)} />
          </Field>
          <Field label="Auth token" hint={editing && !tokenChanged
            ? "Leave as •••• to keep the current token."
            : "Found in your Twilio console. Stored encrypted; shown only once."}>
            <Input type="password" className="tabular" value={authToken}
              onChange={(e) => setAuthToken(e.target.value)}
              onFocus={() => { if (editing && authToken === SENTINEL) setAuthToken(""); }}
              placeholder={editing ? "••••" : "your auth token"} />
          </Field>
          <Field label="Default caller ID (optional)" hint="A number on this account used as the default outbound caller ID.">
            <Input className="tabular" value={phoneNumber} placeholder="+1…"
              onChange={(e) => setPhoneNumber(e.target.value)} />
          </Field>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={() => save.mutate()} disabled={!canSave}>
            {save.isPending && <Loader2Icon className="size-4 animate-spin" aria-hidden />}
            {save.isPending ? "Verifying…" : editing ? "Save" : "Add account"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
