"use client";

import * as React from "react";
import { AudioPlayer } from "@/components/audio-player";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import {
  BotIcon,
  PhoneIcon,
  AudioLinesIcon,
  Loader2Icon,
} from "lucide-react";
import type { CallMessage, CallRecording } from "@/components/calls/columns";

/* ─── helpers ────────────────────────────────────────────────── */

function formatTime(iso: string | undefined): string {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  } catch {
    return "";
  }
}

/** Twilio terminal statuses where the call is over. */
const TERMINAL = new Set([
  "completed",
  "busy",
  "no-answer",
  "failed",
  "canceled",
]);

function isLiveStatus(status?: string): boolean {
  if (!status) return false;
  return !TERMINAL.has(status);
}

/**
 * Scenario-accurate placeholder when a call has no transcript — so a declined /
 * unanswered / failed call reads as what actually happened instead of a generic
 * "no transcript" or a misleading "waiting to start".
 */
function emptyConversationText(status: string | undefined, live: boolean): string {
  const s = (status ?? "").toLowerCase().trim();
  if (live) {
    if (s === "initiated" || s === "queued")
      return "Calling… waiting for the line to connect.";
    if (s === "ringing") return "Ringing… waiting for an answer.";
    // answered / in-progress, but no messages have arrived yet
    return "Connected — waiting for the conversation to start…";
  }
  switch (s) {
    case "no-answer":
    case "no_answer":
    case "noanswer":
      return "No answer — the call rang out and was never picked up.";
    case "busy":
      return "Busy or declined — the call was not answered.";
    case "canceled":
      return "Call canceled before it connected.";
    case "failed":
      return "Call failed to connect.";
    case "completed":
      return "Call ended — no transcript was captured.";
    default:
      return "No transcript captured for this call.";
  }
}

/* ─── one chat bubble ────────────────────────────────────────── */

function Bubble({ msg }: { msg: CallMessage }) {
  const isAgent = msg.role === "assistant" || msg.role === "agent";
  return (
    <div
      className={cn(
        "flex flex-col gap-0.5",
        isAgent ? "items-start" : "items-end"
      )}
    >
      <span
        className={cn(
          "flex items-center gap-1 px-1 text-[10px] font-medium uppercase tracking-wider",
          isAgent ? "text-primary" : "text-muted-foreground"
        )}
      >
        {isAgent ? (
          <BotIcon className="size-3" aria-hidden />
        ) : (
          <PhoneIcon className="size-3" aria-hidden />
        )}
        {isAgent ? "Agent" : "Caller"}
      </span>
      <div
        className={cn(
          "max-w-[80%] rounded-2xl px-3 py-2 text-sm leading-relaxed",
          isAgent
            ? "rounded-tl-sm bg-muted/50 text-foreground"
            : "rounded-tr-sm border border-primary/15 bg-primary/10 text-foreground"
        )}
      >
        {msg.text || (
          <span className="italic text-muted-foreground">(empty)</span>
        )}
      </div>
      {(msg.source || msg.at) && (
        <span
          className={cn(
            "flex items-center gap-1.5 px-1 text-[10px] text-muted-foreground",
            isAgent ? "" : "flex-row-reverse"
          )}
        >
          {msg.source && <span>{msg.source}</span>}
          {msg.at && <span className="tabular">{formatTime(msg.at)}</span>}
        </span>
      )}
    </div>
  );
}

/* ─── recording footer ───────────────────────────────────────── */

function RecordingFooter({
  recording,
  getRecordingUrl,
  status,
}: {
  recording?: CallRecording;
  getRecordingUrl?: () => Promise<string>;
  status?: string;
}) {
  if (recording && getRecordingUrl) {
    return (
      <div className="space-y-1.5">
        <AudioPlayer getUrl={getRecordingUrl} />
        <p className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
          <AudioLinesIcon className="size-3" aria-hidden />
          {recording.format ?? "audio"}
          {recording.durationMs
            ? ` · ${Math.round(recording.durationMs / 1000)}s`
            : ""}
        </p>
      </div>
    );
  }

  if (isLiveStatus(status)) {
    return (
      <p className="text-xs text-muted-foreground">
        Recording will be available after the call ends.
      </p>
    );
  }

  // Recorded (outbound) calls that completed will get a recording shortly after
  // hangup (it's ingested to storage by the webhook); polling fills it in. Calls
  // that never connected (failed/busy/no-answer/canceled) have none.
  if (status === "completed") {
    return (
      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Loader2Icon className="size-3.5 animate-spin" aria-hidden />
        Recording is processing…
      </p>
    );
  }

  return (
    <p className="text-xs text-muted-foreground">No recording for this call.</p>
  );
}

/* ─── main conversation ──────────────────────────────────────── */

export interface CallConversationProps {
  messages: CallMessage[];
  status?: string;
  recording?: CallRecording;
  /** Lazy presigned-URL getter (wraps Calls.recording(id)). */
  getRecordingUrl?: () => Promise<string>;
  /**
   * "fixed" → bounded h-80 scroll area (panels/modals);
   * "auto"  → grows inline (no scroll);
   * "fill"  → fills a flex-column parent and scrolls internally (bento cell).
   */
  height?: "fixed" | "auto" | "fill";
  className?: string;
}

/**
 * Renders a single call's transcript as a chat thread (agent left, caller
 * right) with the recording pinned at the end. Shared by the per-call record
 * page, the campaign single-lead view, and the campaign master-detail pane.
 */
export function CallConversation({
  messages,
  status,
  recording,
  getRecordingUrl,
  height = "fixed",
  className,
}: CallConversationProps) {
  const live = isLiveStatus(status);
  const list = Array.isArray(messages) ? messages : [];
  const endRef = React.useRef<HTMLDivElement>(null);

  // Auto-scroll to the newest message as the conversation grows (live calls).
  // scrollIntoView with block:"nearest" nudges the nearest scrollable ancestor
  // (the ScrollArea viewport) without yanking the whole page.
  React.useEffect(() => {
    endRef.current?.scrollIntoView({ block: "nearest" });
  }, [list.length]);

  const thread = (
    <div className="space-y-3 px-1 py-1">
      {list.length === 0 ? (
        <div className="rounded-lg border border-border py-10 text-center text-sm text-muted-foreground">
          {emptyConversationText(status, live)}
        </div>
      ) : (
        list.map((m, i) => <Bubble key={i} msg={m} />)
      )}

      {live && list.length > 0 && (
        <div className="flex items-center gap-1.5 px-1 pt-1 text-muted-foreground">
          <span className="size-1.5 animate-pulse rounded-full bg-muted-foreground/50 [animation-delay:0ms]" />
          <span className="size-1.5 animate-pulse rounded-full bg-muted-foreground/50 [animation-delay:150ms]" />
          <span className="size-1.5 animate-pulse rounded-full bg-muted-foreground/50 [animation-delay:300ms]" />
        </div>
      )}
      <div ref={endRef} />
    </div>
  );

  return (
    <div
      className={cn(
        "flex flex-col gap-3",
        // Only claim full height on lg, where an ancestor has a definite height.
        // On mobile there's no such ancestor, so we stay auto and let the scroll
        // area below use an explicit viewport height instead.
        height === "fill" && "lg:h-full lg:min-h-0",
        className
      )}
    >
      {height === "auto" ? (
        <div className="rounded-lg border border-border">{thread}</div>
      ) : (
        <ScrollArea
          className={cn(
            "rounded-lg border border-border",
            // fill: explicit height on mobile (no definite-height ancestor),
            // flex-fill on lg. fixed: a constant height everywhere.
            height === "fill"
              ? "h-[55vh] min-h-0 lg:h-auto lg:flex-1"
              : "h-80"
          )}
        >
          {thread}
        </ScrollArea>
      )}

      <div className="shrink-0 border-t border-border pt-3">
        <RecordingFooter
          recording={recording}
          getRecordingUrl={getRecordingUrl}
          status={status}
        />
      </div>
    </div>
  );
}
