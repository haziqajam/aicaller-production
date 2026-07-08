"use client";

import * as React from "react";
import { Calls } from "@/lib/api/resources";
import { StatusChip } from "@/components/status-chip";
import { CallConversation } from "@/components/calls/call-conversation";
import { CallAnalysisPanel } from "@/components/calls/call-analysis-panel";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import {
  formatDuration,
  type CallRecord,
  type CallMessage,
} from "@/components/calls/columns";
import {
  PhoneIncomingIcon,
  PhoneOutgoingIcon,
  BotIcon,
  ClockIcon,
  AudioLinesIcon,
  BrainCircuitIcon,
  EarIcon,
  PhoneForwardedIcon,
} from "lucide-react";

/* ─── helpers ────────────────────────────────────────────────── */

function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    return (
      d.toLocaleDateString(undefined, {
        year: "numeric",
        month: "short",
        day: "numeric",
      }) +
      " " +
      d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    );
  } catch {
    return iso;
  }
}

/** A small labelled value used across the overview/technical grids. */
function Field({
  label,
  children,
  mono,
}: {
  label: string;
  children: React.ReactNode;
  mono?: boolean;
}) {
  return (
    <div className="space-y-0.5 min-w-0">
      <dt className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </dt>
      <dd
        className={cn(
          "truncate text-xs text-foreground",
          mono && "font-mono tabular"
        )}
      >
        {children}
      </dd>
    </div>
  );
}

function ProviderChip({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof BotIcon;
  label: string;
  value?: string;
}) {
  return (
    <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/30 px-3 py-2">
      <Icon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
      <div className="min-w-0">
        <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
          {label}
        </p>
        <p className="truncate text-xs font-medium text-foreground">
          {value || "—"}
        </p>
      </div>
    </div>
  );
}

/* ─── main detail ────────────────────────────────────────────── */

export function CallDetail({
  call,
  assistantName,
}: {
  call: CallRecord;
  assistantName?: string | null;
}) {
  const messages: CallMessage[] = Array.isArray(call.messages)
    ? call.messages
    : [];
  const providers = call.providers ?? {};
  const recording = call.recording ?? null;
  const transfer = call.transfer ?? null;
  const isInbound = call.direction === "inbound";
  const agentLabel = assistantName ?? call.assistantName ?? call.assistantId ?? "—";
  const usageEmpty = !call.usage || Object.keys(call.usage).length === 0;
  const costEmpty = !call.cost || Object.keys(call.cost).length === 0;

  return (
    <div className="space-y-4">
      {/* ── Header: outcome, route, duration ─────────────────── */}
      <div className="rounded-lg border border-border bg-muted/20 p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1.5">
            <div className="flex flex-wrap items-center gap-2">
              <StatusChip status={call.status ?? "—"} />
              <span className="inline-flex items-center gap-1 rounded-full border border-border bg-muted px-2 py-0.5 text-[11px] font-medium capitalize text-muted-foreground">
                {isInbound ? (
                  <PhoneIncomingIcon className="size-3" aria-hidden />
                ) : (
                  <PhoneOutgoingIcon className="size-3" aria-hidden />
                )}
                {call.direction ?? "—"}
              </span>
              {call.hangupCause && call.hangupCause !== call.status && (
                <span className="text-[11px] text-muted-foreground">
                  cause: {call.hangupCause}
                </span>
              )}
            </div>
            <p className="flex items-center gap-1.5 tabular text-sm text-foreground">
              <span className="font-medium">{call.from ?? "—"}</span>
              <span className="text-muted-foreground">→</span>
              <span className="font-medium">{call.to ?? "—"}</span>
            </p>
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <BotIcon className="size-3" aria-hidden />
              {agentLabel}
            </p>
          </div>
          <div className="space-y-0.5 text-right">
            <p className="flex items-center justify-end gap-1.5 tabular text-lg font-semibold text-foreground">
              <ClockIcon className="size-4 text-muted-foreground" aria-hidden />
              {formatDuration(call.durationSeconds)}
            </p>
            <p className="tabular text-xs text-muted-foreground">
              {formatDateTime(call.requestedAt)}
            </p>
          </div>
        </div>

        {/* Recording is shown at the end of the conversation (Transcript tab). */}
      </div>

      {/* ── Tabs: Transcript / Overview / Technical ──────────── */}
      <Tabs defaultValue="transcript">
        <TabsList>
          <TabsTrigger value="transcript">
            Transcript
            {messages.length > 0 && (
              <span className="ml-1 tabular text-[10px] text-muted-foreground">
                {messages.length}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="analysis">Analysis</TabsTrigger>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="technical">Technical</TabsTrigger>
        </TabsList>

        {/* Transcript — shared conversation component (bubbles + recording). */}
        <TabsContent value="transcript" className="mt-3">
          <CallConversation
            messages={messages}
            status={call.status}
            recording={recording}
            getRecordingUrl={
              call.id
                ? () => Calls.recording(call.id!).then((r) => r.url)
                : undefined
            }
          />
        </TabsContent>

        {/* Analysis — boolean questions scored against the transcript. */}
        <TabsContent value="analysis" className="mt-3">
          <CallAnalysisPanel callId={call.id ?? undefined} />
        </TabsContent>

        {/* Overview */}
        <TabsContent value="overview" className="mt-3">
          <div className="rounded-lg border border-border p-4">
            <dl className="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-3">
              <Field label="Status">{call.status ?? "—"}</Field>
              <Field label="Direction">{call.direction ?? "—"}</Field>
              <Field label="Hangup cause">{call.hangupCause ?? "—"}</Field>
              <Field label="Duration">
                {formatDuration(call.durationSeconds)}
              </Field>
              <Field label="From" mono>
                {call.from ?? "—"}
              </Field>
              <Field label="To" mono>
                {call.to ?? "—"}
              </Field>
              <Field label="Requested">{formatDateTime(call.requestedAt)}</Field>
              <Field label="Connected">{formatDateTime(call.connectedAt)}</Field>
              <Field label="Ended">{formatDateTime(call.endedAt)}</Field>
              <Field label="Assistant">{agentLabel}</Field>
              <Field label="Campaign" mono>
                {call.campaignId ?? "—"}
              </Field>
              <Field label="Lead" mono>
                {call.leadId ?? "—"}
              </Field>
            </dl>
          </div>
        </TabsContent>

        {/* Technical */}
        <TabsContent value="technical" className="mt-3 space-y-3">
          {/* Engine chain */}
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            <ProviderChip icon={EarIcon} label="STT" value={providers.stt} />
            <ProviderChip
              icon={BrainCircuitIcon}
              label="LLM"
              value={providers.llm}
            />
            <ProviderChip
              icon={AudioLinesIcon}
              label="TTS"
              value={providers.tts}
            />
          </div>

          {/* Recording + transfer + ids */}
          <div className="rounded-lg border border-border p-4">
            <dl className="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-3">
              <Field label="Call SID" mono>
                {call.callSid ?? "—"}
              </Field>
              {call.twilioErrorCode && (
                <Field label="Twilio error" mono>
                  {call.twilioErrorCode}
                </Field>
              )}
              <Field label="Recording">
                {recording
                  ? `${recording.format ?? "audio"}${
                      recording.durationMs
                        ? ` · ${Math.round(recording.durationMs / 1000)}s`
                        : ""
                    }`
                  : "None"}
              </Field>
              <Field label="Recording key" mono>
                {recording?.objectKey ?? "—"}
              </Field>
            </dl>

            {transfer && (
              <div className="mt-4 border-t border-border pt-3">
                <p className="mb-2 flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                  <PhoneForwardedIcon className="size-3" aria-hidden />
                  Transfer
                </p>
                <dl className="grid grid-cols-2 gap-x-6 gap-y-2 sm:grid-cols-3">
                  {Object.entries(transfer).map(([k, v]) => (
                    <Field key={k} label={k} mono>
                      {typeof v === "string" ? v : JSON.stringify(v)}
                    </Field>
                  ))}
                </dl>
              </div>
            )}

            {/* Usage / cost — currently not wired on the backend */}
            {(usageEmpty || costEmpty) && (
              <p className="mt-4 border-t border-border pt-3 text-[11px] text-muted-foreground">
                Usage &amp; cost metering isn&apos;t tracked yet for this call.
              </p>
            )}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}

/* ─── modal wrapper ──────────────────────────────────────────── */

export function CallDetailDialog({
  call,
  assistantName,
  onOpenChange,
}: {
  call: CallRecord | null;
  assistantName?: string | null;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={!!call} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-h-[88vh] overflow-y-auto sm:max-w-2xl lg:max-w-3xl"
        showCloseButton
      >
        <DialogHeader>
          <DialogTitle>Call details</DialogTitle>
          <DialogDescription>
            {call
              ? `${call.from ?? "—"} → ${call.to ?? "—"}`
              : "Call record"}
          </DialogDescription>
        </DialogHeader>
        {call && <CallDetail call={call} assistantName={assistantName} />}
      </DialogContent>
    </Dialog>
  );
}
