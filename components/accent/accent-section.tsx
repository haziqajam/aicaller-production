"use client";

import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { useWatch, type UseFormReturn } from "react-hook-form";
import {
  FormField,
  FormItem,
  FormLabel,
  FormControl,
  FormDescription,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Voices } from "@/lib/api/resources";
import type { TtsEngineInfo } from "@/lib/api/catalog";
import { voiceOptionsForEngine } from "@/lib/voice-options";
import { getRole } from "@/lib/auth";
import { AudioLines, Mic, Volume2 } from "lucide-react";

/** The engines the accent changer can re-voice with (backend AccentConfig). */
const ACCENT_ENGINES: { id: "kokoro" | "neutts"; label: string; hint: string }[] = [
  { id: "kokoro", label: "Kokoro", hint: "Fastest — recommended" },
  { id: "neutts", label: "NeuTTS", hint: "Higher quality, GPU only" },
];

const DEFAULT_VOICE: Record<string, string> = {
  kokoro: "af_heart",
  neutts: "sophie",
};

/**
 * Should the accent UI be shown at all?
 *
 * The live SIP routing for the accent changer is NOT yet proven on a real call,
 * so this is deliberately not exposed to every customer. Visible when either:
 *   - NEXT_PUBLIC_ACCENT_UI=1 is baked at build time (Railway build arg), or
 *   - the signed-in user is an admin — so the team can use it immediately
 *     without a rebuild, while customers see nothing.
 *
 * Reading the role must be mount-gated: getRole() returns null on the server and
 * the real role on the client, so using it during the first render changes the
 * element count vs. the server HTML and trips a hydration mismatch (same pattern
 * as components/app-sidebar.tsx).
 */
export function useAccentUiVisible(): boolean {
  // useSyncExternalStore rather than the useState+useEffect "mounted" dance:
  // it gives React an explicit SERVER snapshot (false) and a CLIENT snapshot
  // (the real role), which is exactly the hydration-safety this needs — without
  // a setState inside an effect. The role cannot change without a reload, so the
  // subscribe callback is a no-op.
  const isAdmin = React.useSyncExternalStore(
    () => () => {},
    () => getRole() === "admin",
    () => false
  );
  return process.env.NEXT_PUBLIC_ACCENT_UI === "1" || isAdmin;
}

function BetaBadge() {
  return (
    <span className="rounded-sm border border-amber-500/30 bg-amber-500/10 px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wide text-amber-400">
      Beta
    </span>
  );
}

/**
 * The "Accent changer" controls, for the Transfer section of either editor.
 *
 * Writes `transfer.accent.{enabled,ttsEngine,voice}` — exactly what the backend
 * reads (caller/models.py AccentConfig under TransferConfig). The other accent
 * fields (sttEngine, stopMs, requireGpu) are intentionally not surfaced:
 * requireGpu must stay true until CPU TTS is fast enough, and the rest are
 * latency tuning rather than user choices. They round-trip via the schema.
 *
 * `ttsEngines` is the catalog list the editor already fetched, so the voice
 * dropdown reuses the SAME source as the main TTS voice picker instead of
 * hardcoding a second list.
 */
const F = {
  enabled: "transfer.accent.enabled",
  engine: "transfer.accent.ttsEngine",
  voice: "transfer.accent.voice",
} as const;

/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * The form is typed loosely on purpose. react-hook-form's `UseFormReturn<T>` is
 * INVARIANT, so a `UseFormReturn<Assistant>` is not assignable to a shared
 * `UseFormReturn<SomeCommonShape>` even though both Assistant and Flow really do
 * carry `transfer.accent`. Making this component generic instead pushes `never`
 * through every field path and breaks the Select value inference. One loose type
 * here, with a cast at each of the two call sites, is the least-bad option — and
 * the field paths are centralised in `F` above so a rename is still one edit.
 */
export type AccentForm = UseFormReturn<any>;

export function AccentSection({
  form,
  ttsEngines,
}: {
  form: AccentForm;
  ttsEngines: TtsEngineInfo[] | undefined;
}) {
  const { control, setValue, getValues } = form;
  // Watched, not getValues(): the sub-fields must appear/disappear the moment the
  // toggle flips, and the voice list must follow the engine. getValues() does not
  // re-render.
  const enabled = useWatch({ control, name: F.enabled }) === true;
  const engine = (useWatch({ control, name: F.engine })
    ?? "kokoro") as "kokoro" | "neutts";
  // NeuTTS voices are per-owner rows (builtins + this account's clones), so they
  // come from GET /voices — the same query the main TTS picker uses. Kokoro's
  // come from the catalog, and voiceOptionsForEngine hides that difference.
  const { data: neuttsVoices } = useQuery({
    queryKey: ["voices", "neutts"],
    queryFn: () => Voices.list("neutts"),
    enabled: engine === "neutts",
    staleTime: 30 * 1000,
  });

  const voiceOptions = voiceOptionsForEngine(ttsEngines, engine, {
    voices: neuttsVoices,
  });
  const voiceItems = Object.fromEntries(voiceOptions.map((o) => [o.value, o.label]));
  const engineItems = Object.fromEntries(ACCENT_ENGINES.map((e) => [e.id, e.label]));

  /** Switching engine must not leave a voice the new engine has never heard of. */
  const onEngineChange = React.useCallback(
    (next: string | null) => {
      if (!next) return;
      setValue(F.engine, next, { shouldDirty: true });
      setValue(F.voice, DEFAULT_VOICE[next] ?? "", {
        shouldDirty: true,
      });
    },
    [setValue]
  );

  /** Turning it on with an empty voice would save a half-filled config. */
  const onEnabledChange = React.useCallback(
    (on: boolean) => {
      setValue(F.enabled, on, { shouldDirty: true });
      if (on && !getValues(F.voice)) {
        const eng = String(getValues(F.engine) || "kokoro");
        setValue(F.voice, DEFAULT_VOICE[eng] ?? "af_heart", {
          shouldDirty: true,
        });
      }
    },
    [setValue, getValues]
  );

  return (
    <div className="space-y-4 rounded-lg border border-border bg-muted/20 p-3">
      <FormField
        control={control}
        name={F.enabled}
        render={({ field }) => (
          <FormItem className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <FormLabel className="flex items-center gap-1.5">
                <AudioLines className="size-3.5 text-muted-foreground" aria-hidden />
                Change agent&rsquo;s accent
                <BetaBadge />
              </FormLabel>
              <FormDescription>
                After transfer, the agent&rsquo;s speech is re-voiced in a chosen
                voice before the customer hears it. GPU pods only — if none is
                free, the call falls back to a normal transfer.
              </FormDescription>
            </div>
            <FormControl>
              <Switch
                checked={!!field.value}
                onCheckedChange={onEnabledChange}
              />
            </FormControl>
          </FormItem>
        )}
      />

      {enabled && (
        <div className="space-y-4 border-t border-border pt-4">
          <FormField
            control={control}
            name={F.engine}
            render={({ field }) => (
              <FormItem>
                <FormLabel>Voice engine</FormLabel>
                <Select
                  items={engineItems}
                  value={field.value}
                  onValueChange={onEngineChange}
                >
                  <FormControl>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Select engine" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {ACCENT_ENGINES.map((e) => (
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
                <FormDescription>
                  Switching engines resets the voice below.
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={control}
            name={F.voice}
            render={({ field }) => (
              <FormItem>
                <FormLabel>Accent voice</FormLabel>
                <Select
                  items={voiceItems}
                  value={field.value}
                  onValueChange={field.onChange}
                >
                  <FormControl>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Select voice" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {voiceOptions.map((v) => (
                      <SelectItem key={v.value} value={v.value} disabled={v.disabled}>
                        <Mic className="size-3.5 text-muted-foreground" />
                        {v.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormDescription>
                  The customer hears the agent&rsquo;s words in this voice.
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>
      )}
    </div>
  );
}
/* eslint-enable @typescript-eslint/no-explicit-any */
