"use client";

import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Assistants } from "@/lib/api/resources";
import { API_BASE } from "@/lib/api/client";
import { getToken } from "@/lib/auth";
import type { Assistant } from "@/lib/api/schemas";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import {
  MicIcon, PhoneOffIcon, BotIcon, HeadphonesIcon, ServerIcon,
  PhoneIncomingIcon, PhoneOutgoingIcon,
} from "lucide-react";

type Status = "idle" | "connecting" | "live" | "ended" | "error";
type Direction = "inbound" | "outbound";

/**
 * Normalize a user-typed or pod-provided host into an http(s) origin with no
 * trailing slash. Bare hostnames (a pasted Cloudflare/vast URL without scheme)
 * default to https. Returns null for blank input.
 */
function normalizeHost(input: string | undefined | null): string | null {
  const raw = (input ?? "").trim();
  if (!raw) return null;
  const withScheme = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  return withScheme.replace(/\/+$/, "");
}

/** Pretty host (no scheme) for display. */
function hostLabel(httpBase: string): string {
  return httpBase.replace(/^https?:\/\//i, "");
}

/**
 * Talk to an assistant entirely in the browser — no phone, no carrier. The mic is
 * captured via the Web Audio API, streamed as raw PCM16 over a WebSocket to
 * /ws-web, and the bot's audio is played back. The WebSocket itself is the media
 * path (see caller/web_bot.py + raw_pcm_serializer.py).
 *
 * Two directions:
 *  - **Outbound** — just pick an assistant and call. Runs on the control plane
 *    (API_BASE). This is the simple default.
 *  - **Inbound** — the call runs ON a specific GPU pod: target it via a locked
 *    `wsBaseOverride` (the fleet "Call on this pod" action) or by pasting a pod URL.
 * Pods serve the same /ws-web route and share JWT_SECRET + Mongo, so the browser
 * JWT validates and the selected assistant resolves wherever the call lands. The
 * chosen direction is passed to the bot as a query param.
 */
export function BrowserCallDialog({
  defaultAssistantId,
  wsBaseOverride,
  targetLabel,
  defaultDirection,
  renderTrigger,
}: {
  defaultAssistantId?: string;
  /** When set, lock the call to inbound-on-this-pod (https://… or wss://…). */
  wsBaseOverride?: string;
  /** Friendly name for the locked pod target shown in the dialog. */
  targetLabel?: string;
  /** Initial direction when not pod-locked. Defaults to "outbound". */
  defaultDirection?: Direction;
  /** Custom trigger; receives an `open` callback. Defaults to a "Test call" button. */
  renderTrigger?: (open: () => void) => React.ReactNode;
}) {
  const lockedToPod = !!normalizeHost(wsBaseOverride);

  const [open, setOpen] = React.useState(false);
  const [assistantId, setAssistantId] = React.useState(defaultAssistantId ?? "");
  const [manualHost, setManualHost] = React.useState("");
  const [direction, setDirection] = React.useState<Direction>(
    lockedToPod ? "inbound" : (defaultDirection ?? "outbound"),
  );
  const [status, setStatus] = React.useState<Status>("idle");

  const { data: assistants } = useQuery<Assistant[]>({
    queryKey: ["assistants"],
    queryFn: Assistants.list,
    enabled: open,
  });

  // A pod-locked dialog is always inbound; otherwise the toggle decides.
  const effectiveDirection: Direction = lockedToPod ? "inbound" : direction;
  // Inbound may target a specific pod; outbound always runs on the control plane.
  const targetHttpBase =
    effectiveDirection === "inbound"
      ? (normalizeHost(wsBaseOverride) ?? normalizeHost(manualHost) ?? API_BASE)
      : API_BASE;

  // Live audio graph + socket — kept in refs so React renders don't disturb them.
  const wsRef = React.useRef<WebSocket | null>(null);
  const ctxRef = React.useRef<AudioContext | null>(null);
  const streamRef = React.useRef<MediaStream | null>(null);
  const nodesRef = React.useRef<AudioNode[]>([]);

  const teardown = React.useCallback((next: Status) => {
    try { wsRef.current?.close(); } catch { /* ignore */ }
    wsRef.current = null;
    for (const n of nodesRef.current) { try { n.disconnect(); } catch { /* ignore */ } }
    nodesRef.current = [];
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (ctxRef.current && ctxRef.current.state !== "closed") {
      ctxRef.current.close().catch(() => {});
    }
    ctxRef.current = null;
    setStatus((s) => (s === "error" ? s : next));
  }, []);

  // Always tear the call down on unmount.
  React.useEffect(() => () => teardown("idle"), [teardown]);

  const start = React.useCallback(async () => {
    const token = getToken();
    if (!token) { toast.error("Please sign in again."); return; }
    if (!assistantId) return;
    if (!navigator.mediaDevices?.getUserMedia || typeof AudioContext === "undefined") {
      toast.error("This browser can't capture audio (needs a secure context: https or localhost).");
      return;
    }
    setStatus("connecting");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
      streamRef.current = stream;

      const ctx = new AudioContext({ sampleRate: 16000 });
      ctxRef.current = ctx;
      await ctx.resume();
      await ctx.audioWorklet.addModule("/pcm-worklets.js");

      const source = ctx.createMediaStreamSource(stream);
      const capture = new AudioWorkletNode(ctx, "pcm-capture");
      const player = new AudioWorkletNode(ctx, "pcm-player");
      // Capture must be pulled by the graph to run → route it through a muted gain.
      const muted = ctx.createGain();
      muted.gain.value = 0;
      source.connect(capture);
      capture.connect(muted);
      muted.connect(ctx.destination);
      player.connect(ctx.destination);
      nodesRef.current = [source, capture, player, muted];

      // Target the resolved origin (control plane or a specific pod). http→ws,
      // https→wss; trailing slash already stripped by normalizeHost.
      const wsBase = targetHttpBase.replace(/^http/, "ws");
      const url = `${wsBase}/ws-web?token=${encodeURIComponent(token)}`
        + `&assistantId=${encodeURIComponent(assistantId)}`
        + `&direction=${effectiveDirection}`;
      const ws = new WebSocket(url);
      ws.binaryType = "arraybuffer";
      wsRef.current = ws;

      // Mic batches (Int16) → binary WS frames.
      capture.port.onmessage = (e: MessageEvent) => {
        if (ws.readyState === WebSocket.OPEN) ws.send((e.data as Int16Array).buffer);
      };
      // Bot audio (binary) → player; control JSON (clear/end) handled inline.
      ws.onmessage = (e: MessageEvent) => {
        if (typeof e.data === "string") {
          try {
            const m = JSON.parse(e.data);
            if (m.event === "clear") player.port.postMessage({ cmd: "clear" });
            else if (m.event === "end") teardown("ended");
          } catch { /* ignore */ }
        } else {
          player.port.postMessage(e.data, [e.data as ArrayBuffer]);
        }
      };
      ws.onopen = () => setStatus("live");
      ws.onerror = () => { toast.error("Call connection failed."); teardown("error"); };
      ws.onclose = () => teardown("ended");
    } catch (err) {
      // The browser-audio setup (getUserMedia / AudioContext / worklet) runs
      // before the WebSocket opens, so a failure here shows no network request.
      // Surface the real cause instead of a single opaque message.
      console.error("[web-call] start failed:", err);
      const name = err instanceof DOMException ? err.name : "";
      const msg =
        name === "NotAllowedError"
          ? "Microphone permission denied."
          : name === "NotFoundError"
          ? "No microphone found."
          : name === "NotReadableError"
          ? "Microphone is in use by another app."
          : name === "AbortError"
          ? "Couldn't load the audio engine (pcm-worklets.js). Reload and retry."
          : `Couldn't start the call${
              err instanceof Error && err.message ? `: ${err.message}` : "."
            }`;
      toast.error(msg);
      teardown("error");
    }
  }, [assistantId, targetHttpBase, effectiveDirection, teardown]);

  const live = status === "live";
  const connecting = status === "connecting";
  const busy = live || connecting;
  const openDialog = () => { setStatus("idle"); setOpen(true); };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o && defaultAssistantId) setAssistantId(defaultAssistantId);
        if (!o) teardown("idle"); // closing the dialog hangs up
      }}
    >
      {renderTrigger ? (
        renderTrigger(openDialog)
      ) : (
        <Button variant="outline" onClick={openDialog}>
          <MicIcon className="size-4" aria-hidden />
          Test call
        </Button>
      )}
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{lockedToPod ? "Call on this pod" : "Talk to your assistant"}</DialogTitle>
          <DialogDescription>
            Speak to the assistant right here in your browser — no phone and no carrier. Use headphones for the cleanest result.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          {/* Direction toggle — hidden when locked to a specific pod (always inbound). */}
          {!lockedToPod && (
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Direction</label>
              <div className="grid grid-cols-2 gap-2">
                {([
                  { v: "outbound", label: "Outbound", icon: PhoneOutgoingIcon, hint: "Pick an assistant and call" },
                  { v: "inbound", label: "Inbound", icon: PhoneIncomingIcon, hint: "Run the call on a pod" },
                ] as const).map(({ v, label, icon: Icon, hint }) => {
                  const on = direction === v;
                  return (
                    <button
                      key={v}
                      type="button"
                      onClick={() => setDirection(v)}
                      aria-pressed={on}
                      disabled={busy}
                      title={hint}
                      className={cn(
                        "flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition-colors disabled:opacity-50",
                        on
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-border bg-background text-foreground hover:bg-muted",
                      )}
                    >
                      <Icon className="size-4 shrink-0" aria-hidden />
                      {label}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <div className="space-y-1.5">
            <label className="text-sm font-medium">Assistant</label>
            <Select value={assistantId || null} onValueChange={(v) => setAssistantId(v ?? "")} disabled={busy}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select an assistant…" />
              </SelectTrigger>
              <SelectContent>
                {(assistants ?? []).map((a) => (
                  <SelectItem key={a.id ?? a.name} value={a.id ?? ""}>
                    <BotIcon className="size-3.5 text-muted-foreground" />
                    {a.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Inbound target host. Locked + read-only when invoked for a specific pod;
              a manual pod-URL field otherwise. Outbound has no host field. */}
          {lockedToPod ? (
            <div className="flex items-center gap-2 rounded-md border border-border bg-muted/30 px-3 py-2 text-xs">
              <ServerIcon className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
              <span className="text-muted-foreground">Runs on</span>
              <span className="min-w-0 flex-1 truncate font-mono text-foreground" title={targetHttpBase}>
                {targetLabel ?? hostLabel(targetHttpBase)}
              </span>
            </div>
          ) : effectiveDirection === "inbound" ? (
            <div className="space-y-1.5">
              <label className="text-sm font-medium">
                Pod URL <span className="font-normal text-muted-foreground">(optional)</span>
              </label>
              <Input
                value={manualHost}
                onChange={(e) => setManualHost(e.target.value)}
                placeholder="e.g. inbound-xxxx.ringsline.online — blank uses the control plane"
                disabled={busy}
                className="font-mono text-xs"
              />
              <p className="text-xs text-muted-foreground">
                Paste a Cloudflare/vast pod URL to run the inbound call on that pod. Leave blank to use{" "}
                <span className="font-mono">{hostLabel(API_BASE)}</span>.
              </p>
            </div>
          ) : null}

          <div className="flex items-center gap-2 rounded-md border border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
            <span className={cn(
              "size-2 shrink-0 rounded-full",
              live ? "bg-emerald-500 animate-pulse" : connecting ? "bg-amber-500 animate-pulse"
                : status === "error" ? "bg-destructive" : "bg-muted-foreground/40",
            )} aria-hidden />
            <span>
              {live ? "Live — start talking" : connecting ? "Connecting…"
                : status === "ended" ? "Call ended" : status === "error" ? "Call failed"
                : "Not connected"}
            </span>
            <HeadphonesIcon className="ml-auto size-3.5" aria-hidden />
          </div>
        </div>

        <DialogFooter>
          {busy ? (
            <Button variant="destructive" onClick={() => teardown("ended")}>
              <PhoneOffIcon className="size-4" aria-hidden />
              Hang up
            </Button>
          ) : (
            <>
              <Button variant="outline" onClick={() => setOpen(false)}>Close</Button>
              <Button onClick={start} disabled={!assistantId}>
                <MicIcon className="size-4" aria-hidden />
                Start call
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
