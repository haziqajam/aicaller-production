"use client";

import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Flows } from "@/lib/api/resources";
import { API_BASE } from "@/lib/api/client";
import { getToken } from "@/lib/auth";
import type { Flow } from "@/lib/api/schemas";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import {
  MicIcon, PhoneOffIcon, WorkflowIcon, HeadphonesIcon,
} from "lucide-react";

type Status = "idle" | "connecting" | "live" | "ended" | "error";

/**
 * Talk to a Pipecat Flow entirely in the browser — the flow sibling of
 * BrowserCallDialog (which stays assistant-only and untouched). Same media
 * path: mic → PCM16 over a WebSocket, bot audio back — but to /ws-flow, which
 * (exactly like /ws-web does for assistants) takes only the flow's ID in the
 * URL and loads the flow JSON from the DB, owner-scoped.
 *
 * Supports controlled (open/onOpenChange, e.g. from a card menu item) and
 * uncontrolled (renders its own "Test call" trigger) usage. Always mounted by
 * its parent — never conditionally unmount a Base UI dialog while open.
 */
export function FlowCallDialog({
  defaultFlowId,
  open: openProp,
  onOpenChange,
  renderTrigger,
}: {
  defaultFlowId?: string;
  /** Controlled open state (with onOpenChange). Omit for uncontrolled. */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** Custom trigger; receives an `open` callback. Defaults to a "Test call" button (uncontrolled only). */
  renderTrigger?: (open: () => void) => React.ReactNode;
}) {
  const controlled = openProp !== undefined;
  const [openState, setOpenState] = React.useState(false);
  const open = controlled ? (openProp as boolean) : openState;

  const [flowId, setFlowId] = React.useState(defaultFlowId ?? "");
  const [status, setStatus] = React.useState<Status>("idle");

  const { data: flows } = useQuery<Flow[]>({
    queryKey: ["flows"],
    queryFn: Flows.list,
    enabled: open,
  });

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

  const setOpen = React.useCallback((o: boolean) => {
    if (!controlled) setOpenState(o);
    onOpenChange?.(o);
    if (o) {
      setStatus("idle");
      if (defaultFlowId) setFlowId(defaultFlowId);
    } else {
      teardown("idle"); // closing the dialog hangs up
    }
  }, [controlled, onOpenChange, defaultFlowId, teardown]);

  const start = React.useCallback(async () => {
    const token = getToken();
    if (!token) { toast.error("Please sign in again."); return; }
    if (!flowId) return;
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

      // Flow tests always run on the control plane (API_BASE). http→ws, https→wss.
      const wsBase = API_BASE.replace(/^http/, "ws");
      const url = `${wsBase}/ws-flow?token=${encodeURIComponent(token)}`
        + `&flowId=${encodeURIComponent(flowId)}`;
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
      // Browser-audio setup runs before the WebSocket opens — surface the real cause.
      console.error("[flow-call] start failed:", err);
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
  }, [flowId, teardown]);

  const live = status === "live";
  const connecting = status === "connecting";
  const busy = live || connecting;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {!controlled && (
        renderTrigger ? (
          renderTrigger(() => setOpen(true))
        ) : (
          <Button variant="outline" onClick={() => setOpen(true)}>
            <MicIcon className="size-4" aria-hidden />
            Test call
          </Button>
        )
      )}
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Talk to your flow</DialogTitle>
          <DialogDescription>
            Walk the conversation graph right here in your browser — no phone and
            no carrier. Use headphones for the cleanest result.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Flow</label>
            <Select value={flowId || null} onValueChange={(v) => setFlowId(v ?? "")} disabled={busy}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select a flow…" />
              </SelectTrigger>
              <SelectContent>
                {(flows ?? []).map((f) => (
                  <SelectItem key={f.id ?? f.name} value={f.id ?? ""}>
                    <WorkflowIcon className="size-3.5 text-muted-foreground" />
                    {f.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

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
              <Button onClick={start} disabled={!flowId}>
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
