"use client";

import * as React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Admin, type UserRecord, type Tier } from "@/lib/api/admin";
import { toastApiError, parseApiError } from "@/lib/api/errors";
import { getRole } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogTrigger,
} from "@/components/ui/dialog";
import { GaugeIcon, ShieldIcon } from "lucide-react";

// Engine universes — must mirror the catalog seeds (routes_catalog.py) / tiers.py.
const LLM_PROVIDERS = ["openai", "groq", "ollama"];
const STT_ENGINES = ["deepgram", "openai", "asrtest", "whisper_local"];
const TTS_ENGINES = ["kokoro", "piper_urdu", "vibevoice", "deepgram"];

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
              Admin access is required to manage tiers.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

/** Inline tier select — picking a tier re-applies that tier's preset limits. */
function TierSelect({ user }: { user: UserRecord }) {
  const qc = useQueryClient();
  const [saving, setSaving] = React.useState(false);

  async function handleChange(value: string | null) {
    const tier = value as Tier | null;
    if (!tier || tier === user.tier) return;
    setSaving(true);
    try {
      await Admin.setTier(user.id, { tier });
      await qc.invalidateQueries({ queryKey: ["admin-users-tiers"] });
      toast.success(`${user.email} → ${tier} (preset applied)`);
    } catch (err) {
      toastApiError(err, "Couldn't set tier");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Select value={user.tier ?? undefined} onValueChange={handleChange} disabled={saving}>
      <SelectTrigger className="w-28" size="sm">
        <SelectValue placeholder="—" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="basic">Basic</SelectItem>
        <SelectItem value="pro">Pro</SelectItem>
        <SelectItem value="ultra">Ultra</SelectItem>
      </SelectContent>
    </Select>
  );
}

function AllowListEditor({
  label,
  universe,
  value,
  onChange,
}: {
  label: string;
  universe: string[];
  value: string[] | null;
  onChange: (v: string[] | null) => void;
}) {
  const restricted = value !== null;
  return (
    <div className="space-y-1.5 rounded-md border border-border p-2">
      <label className="flex items-center gap-2 text-xs font-medium text-foreground">
        <Checkbox
          checked={restricted}
          onCheckedChange={(c) => onChange(c ? [] : null)}
        />
        Restrict {label}
        {!restricted && <span className="text-muted-foreground">(all allowed)</span>}
      </label>
      {restricted && (
        <div className="grid grid-cols-2 gap-1.5 pl-6">
          {universe.map((eng) => (
            <label key={eng} className="flex items-center gap-2 text-xs">
              <Checkbox
                checked={value!.includes(eng)}
                onCheckedChange={(c) =>
                  onChange(c ? [...value!, eng] : value!.filter((e) => e !== eng))
                }
              />
              <span className="font-mono">{eng}</span>
            </label>
          ))}
        </div>
      )}
    </div>
  );
}

function EditLimitsDialog({ user }: { user: UserRecord }) {
  const qc = useQueryClient();
  const [open, setOpen] = React.useState(false);
  const [maxSeats, setMaxSeats] = React.useState<string>("");
  const [llm, setLlm] = React.useState<string[] | null>(null);
  const [stt, setStt] = React.useState<string[] | null>(null);
  const [tts, setTts] = React.useState<string[] | null>(null);
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    if (open) {
      setMaxSeats(user.maxSeats == null ? "" : String(user.maxSeats));
      setLlm(user.llmProviderAllowList ?? null);
      setStt(user.sttEngineAllowList ?? null);
      setTts(user.ttsEngineAllowList ?? null);
    }
  }, [open, user]);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const trimmed = maxSeats.trim();
      await Admin.setTier(user.id, {
        maxSeats: trimmed === "" ? null : Number(trimmed),
        llmProviderAllowList: llm,
        sttEngineAllowList: stt,
        ttsEngineAllowList: tts,
      });
      setOpen(false);
      await qc.invalidateQueries({ queryKey: ["admin-users-tiers"] });
      toast.success(`Limits updated for ${user.email}`);
    } catch (err) {
      toastApiError(err, "Couldn't update limits");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="outline" size="sm" />}>Edit limits</DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Limits · {user.email}</DialogTitle>
          <DialogDescription>
            Overrides layered on top of the tier preset. Leave seats blank for
            unlimited; unchecked &quot;Restrict&quot; means all engines allowed.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSave} className="space-y-3">
          <div className="space-y-1">
            <label className="text-xs font-medium text-foreground">Max bot seats</label>
            <Input
              type="number"
              min={0}
              placeholder="Unlimited"
              value={maxSeats}
              onChange={(e) => setMaxSeats(e.target.value)}
            />
          </div>
          <AllowListEditor label="LLM providers" universe={LLM_PROVIDERS} value={llm} onChange={setLlm} />
          <AllowListEditor label="STT engines" universe={STT_ENGINES} value={stt} onChange={setStt} />
          <AllowListEditor label="TTS engines" universe={TTS_ENGINES} value={tts} onChange={setTts} />
          <DialogFooter>
            <Button type="submit" disabled={saving} className="w-full">
              {saving ? "Saving…" : "Save limits"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function limitSummary(list: string[] | null | undefined): string {
  if (list == null) return "all";
  if (list.length === 0) return "none";
  return list.join(", ");
}

export default function AdminTiersPage() {
  const role = getRole();
  if (role !== "admin") return <NotAuthorized />;
  return <TiersContent />;
}

function TiersContent() {
  const { data, isLoading, isError, error } = useQuery<UserRecord[]>({
    queryKey: ["admin-users-tiers"],
    queryFn: Admin.listUsers,
  });
  const users = data ?? [];

  return (
    <div className="space-y-4">
      <div>
        <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
          Admin
        </p>
        <h1 className="mt-0.5 text-base font-semibold text-foreground">Tiers &amp; limits</h1>
        <p className="text-xs text-muted-foreground mt-0.5">
          Assign each user a plan tier and bot-seat quota, and restrict which
          LLM/STT/TTS engines they can use. Picking a tier applies its preset;
          &quot;Edit limits&quot; overrides individual values.
        </p>
      </div>

      {isLoading && <Skeleton className="h-64 w-full" />}

      {isError && (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            {parseApiError(error, "Couldn't load users.")}
          </CardContent>
        </Card>
      )}

      {!isLoading && !isError && (
        <div className="rounded-lg border border-border overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Email</TableHead>
                <TableHead>Tier</TableHead>
                <TableHead>Seats</TableHead>
                <TableHead>LLM</TableHead>
                <TableHead>STT</TableHead>
                <TableHead>TTS</TableHead>
                <TableHead className="text-right"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.map((u) => (
                <TableRow key={u.id}>
                  <TableCell className="font-mono text-xs">{u.email}</TableCell>
                  <TableCell><TierSelect user={u} /></TableCell>
                  <TableCell className="tabular text-xs">
                    {u.maxSeats == null ? "∞" : u.maxSeats}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground max-w-[10rem] truncate">
                    {limitSummary(u.llmProviderAllowList)}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground max-w-[10rem] truncate">
                    {limitSummary(u.sttEngineAllowList)}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground max-w-[10rem] truncate">
                    {limitSummary(u.ttsEngineAllowList)}
                  </TableCell>
                  <TableCell className="text-right">
                    <EditLimitsDialog user={u} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {users.length === 0 && (
            <div className="flex flex-col items-center gap-3 py-14 text-center">
              <div className="flex size-10 items-center justify-center rounded-lg bg-muted">
                <GaugeIcon className="size-5 text-muted-foreground" aria-hidden />
              </div>
              <p className="text-sm font-medium">No users yet</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
