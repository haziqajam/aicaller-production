"use client";

import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { AccentConfigApi, Voices } from "@/lib/api/resources";
import { accentConfig, type AccentConfig } from "@/lib/api/schemas";
import { Catalog } from "@/lib/api/catalog";
import { toastApiError } from "@/lib/api/errors";
import { voiceOptionsForEngine } from "@/lib/voice-options";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { AudioLines, Cpu, Mic, Volume2 } from "lucide-react";

const ENGINES: { id: "kokoro" | "neutts"; label: string; hint: string }[] = [
  { id: "kokoro", label: "Kokoro", hint: "Fastest — runs on cheap CPU pods" },
  { id: "neutts", label: "NeuTTS", hint: "Higher quality — GPU pods only" },
];

const DEFAULT_VOICE: Record<string, string> = {
  kokoro: "af_heart",
  neutts: "sophie",
};

function BetaBadge() {
  return (
    <span className="rounded-sm border border-amber-500/30 bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-amber-400">
      Beta
    </span>
  );
}

/**
 * Accent changer settings — ONE config for the whole account.
 *
 * v1 put this on each assistant. It is an account-level capability: whichever
 * assistant runs the bot, this decides whether that owner's transfers are
 * re-voiced. The relay runs on a dedicated accent pod, so the bot pod is freed at
 * hand-off exactly like a normal transfer.
 */
export default function AccentSettingsPage() {
  const qc = useQueryClient();
  const { data: saved, isPending } = useQuery({
    queryKey: ["accent-config"],
    queryFn: AccentConfigApi.get,
  });
  const { data: catalog } = useQuery({
    queryKey: ["catalog"],
    queryFn: Catalog.get,
    staleTime: 5 * 60 * 1000,
  });

  // Unsaved edits as an OVERLAY on the server value, rather than a copy seeded by
  // an effect: there is no state to synchronise, so there is no effect, and the
  // form cannot drift from a refetched server value.
  const [edits, setEdits] = React.useState<Partial<AccentConfig>>({});
  const base = React.useMemo(
    () => (saved ? accentConfig.parse(saved) : null),
    [saved]
  );
  const cfg = base ? { ...base, ...edits } : null;
  const engine = (cfg?.ttsEngine ?? "kokoro") as "kokoro" | "neutts";

  const { data: neuttsVoices } = useQuery({
    queryKey: ["voices", "neutts"],
    queryFn: () => Voices.list("neutts"),
    enabled: engine === "neutts",
    staleTime: 30 * 1000,
  });

  const voiceOptions = voiceOptionsForEngine(catalog?.tts, engine, {
    voices: neuttsVoices,
  });

  const save = useMutation({
    mutationFn: (next: AccentConfig) => AccentConfigApi.update(next),
    onSuccess: (res) => {
      toast.success("Accent settings saved");
      qc.setQueryData(["accent-config"], res);
      setEdits({});            // the server value is now the truth again
    },
    onError: (err) => toastApiError(err, "Couldn't save accent settings"),
  });

  function patch(next: Partial<AccentConfig>) {
    setEdits((e) => ({ ...e, ...next }));
  }

  /** Switching engine must not leave a voice the new engine has never heard of. */
  function onEngineChange(value: string | null) {
    if (!value) return;
    patch({
      ttsEngine: value as "kokoro" | "neutts",
      voice: DEFAULT_VOICE[value] ?? "",
    });
  }

  const dirty = !!cfg && !!base && JSON.stringify(cfg) !== JSON.stringify(base);

  if (isPending || !cfg) {
    return (
      <div className="space-y-6">
        <PageHeader eyebrow="Settings" title="Accent changer" />
        <Card>
          <CardContent className="space-y-3 py-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Settings"
        title="Accent changer"
        description="After a call is transferred to a human agent, the agent's speech is re-voiced in a chosen voice before the customer hears it. The customer's own audio reaches the agent unchanged."
        actions={
          <Button
            onClick={() => save.mutate(cfg)}
            disabled={!dirty || save.isPending}
          >
            {save.isPending ? "Saving…" : "Save"}
          </Button>
        }
      />

      <Card>
        <CardContent className="space-y-5 py-5">
          {/* --- enable ------------------------------------------------- */}
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0 space-y-1">
              <div className="flex items-center gap-1.5 text-sm font-medium">
                <AudioLines className="size-4 text-muted-foreground" aria-hidden />
                Enable accent changer
                <BetaBadge />
              </div>
              <p className="text-xs text-muted-foreground">
                Applies to every assistant on this account. When no accent pod is
                free the call falls back to a normal transfer, so a caller is never
                left waiting.
              </p>
            </div>
            <Switch
              checked={cfg.enabled}
              onCheckedChange={(on) =>
                patch({
                  enabled: on === true,
                  // Turning it on with no voice would save a half-filled config.
                  voice: cfg.voice || DEFAULT_VOICE[cfg.ttsEngine] || "af_heart",
                })
              }
            />
          </div>

          {cfg.enabled && (
            <div className="space-y-5 border-t border-border pt-5">
              {/* --- engine --------------------------------------------- */}
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Voice engine</label>
                <Select
                  items={Object.fromEntries(ENGINES.map((e) => [e.id, e.label]))}
                  value={cfg.ttsEngine}
                  onValueChange={onEngineChange}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select engine" />
                  </SelectTrigger>
                  <SelectContent>
                    {ENGINES.map((e) => (
                      <SelectItem key={e.id} value={e.id}>
                        <Volume2 className="size-3.5 text-muted-foreground" />
                        {e.label}
                        <span className="ml-auto text-[10px] text-muted-foreground">
                          {e.hint}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Switching engines resets the voice below.
                </p>
              </div>

              {/* --- voice ---------------------------------------------- */}
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Accent voice</label>
                <Select
                  items={Object.fromEntries(
                    voiceOptions.map((o) => [o.value, o.label])
                  )}
                  value={cfg.voice}
                  onValueChange={(v) => v && patch({ voice: String(v) })}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select voice" />
                  </SelectTrigger>
                  <SelectContent>
                    {voiceOptions.map((v) => (
                      <SelectItem key={v.value} value={v.value} disabled={v.disabled}>
                        <Mic className="size-3.5 text-muted-foreground" />
                        {v.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  The customer hears the agent&rsquo;s words in this voice.
                </p>
              </div>

              {/* --- placement ------------------------------------------ */}
              <div className="flex items-start justify-between gap-4 border-t border-border pt-5">
                <div className="min-w-0 space-y-1">
                  <div className="flex items-center gap-1.5 text-sm font-medium">
                    <Cpu className="size-4 text-muted-foreground" aria-hidden />
                    Prefer CPU pods
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Cheaper, with slightly higher latency. Kokoro runs comfortably
                    on CPU.{" "}
                    {engine === "neutts" && (
                      <span className="text-warning">
                        NeuTTS always uses a GPU pod — it runs below realtime on
                        CPU, so this setting is ignored.
                      </span>
                    )}
                  </p>
                </div>
                <Switch
                  checked={cfg.preferCpu}
                  disabled={engine === "neutts"}
                  onCheckedChange={(on) => patch({ preferCpu: on === true })}
                />
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
