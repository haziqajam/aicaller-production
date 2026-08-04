"use client";

import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Voices } from "@/lib/api/resources";
import { toastApiError } from "@/lib/api/errors";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import {
  CLONE_MAX_SECONDS,
  CLONE_MIN_SECONDS,
  VOICE_NAME_RE,
  slugifyVoiceName,
  transcriptCoverageWarning,
} from "@/lib/voice-options";
import {
  AudioLinesIcon,
  CheckCircle2Icon,
  Loader2Icon,
  TriangleAlertIcon,
  UploadIcon,
} from "lucide-react";

type Phase = "idle" | "uploading" | "encoding" | "ready" | "failed";

/**
 * Self-service voice cloning: upload a clip + its transcript, watch it encode,
 * and have the new voice appear in the picker automatically.
 *
 * The transcript matters more than it looks: NeuTTS aligns the reference text
 * against the reference audio, so a transcript that only covers part of the clip
 * produces a wrong-sounding clone with NO error anywhere. That is why the field
 * is required, prominent, and sanity-checked against the clip's duration.
 */
export function CloneVoiceDialog({
  engine = "neutts",
  trigger,
  triggerLabel = "Clone a voice",
}: {
  /** Which engine's picker to refresh when a clone turns ready. */
  engine?: string;
  /** Overrides the trigger button's appearance only, not its label. */
  trigger?: React.ReactElement;
  triggerLabel?: string;
}) {
  const qc = useQueryClient();
  const [open, setOpen] = React.useState(false);
  const [file, setFile] = React.useState<File | null>(null);
  const [duration, setDuration] = React.useState<number | null>(null);
  const [displayName, setDisplayName] = React.useState("");
  const [name, setName] = React.useState("");
  const [transcript, setTranscript] = React.useState("");
  const [consent, setConsent] = React.useState(false);
  const [voiceId, setVoiceId] = React.useState<string | null>(null);
  // Only the trigger failure is stored — every other error text comes from the
  // polled voice row, so there is nothing to keep in sync.
  const [startError, setStartError] = React.useState<string | null>(null);

  const effectiveName = name.trim() || slugifyVoiceName(displayName);
  const nameValid = VOICE_NAME_RE.test(effectiveName);
  const coverage = transcriptCoverageWarning(transcript, duration);
  // `duration === null` means this browser couldn't measure the clip, NOT that
  // it's invalid — the server re-checks either way, so don't block on unknown.
  const durationOutOfRange =
    duration !== null &&
    (duration < CLONE_MIN_SECONDS || duration > CLONE_MAX_SECONDS);

  function reset() {
    setFile(null);
    setDuration(null);
    setDisplayName("");
    setName("");
    setTranscript("");
    setConsent(false);
    setVoiceId(null);
    setStartError(null);
    clone.reset();
    notified.current = null;
  }

  /** Read the clip's duration in the browser so bad input is caught before upload. */
  function onPickFile(picked: File | null) {
    setFile(picked);
    setDuration(null);
    if (!picked) return;
    const url = URL.createObjectURL(picked);
    const audio = new Audio();
    audio.preload = "metadata";
    audio.onloadedmetadata = () => {
      // A non-finite duration just means this browser couldn't measure it —
      // treat it as unknown and let the server decide, never as invalid.
      setDuration(Number.isFinite(audio.duration) ? audio.duration : null);
      URL.revokeObjectURL(url);
    };
    audio.onerror = () => {
      setDuration(null);
      URL.revokeObjectURL(url);
    };
    audio.src = url;
  }

  const clone = useMutation({
    mutationFn: () =>
      Voices.clone({
        audio: file as File,
        transcript,
        displayName: displayName.trim(),
        name: name.trim() || undefined,
        consent,
      }),
    onMutate: () => setStartError(null),
    onSuccess: (res) => {
      setVoiceId(res.id);
      if (res.status === "failed") {
        setStartError(res.error ?? "Encoding could not be started.");
      }
      // Show it in the picker straight away as "(processing…)" — a clone that
      // disappears for the ~20s it encodes looks like a lost upload.
      qc.invalidateQueries({ queryKey: ["voices", engine] });
    },
    onError: (err) => toastApiError(err, "Couldn't start the voice clone"),
  });

  // Poll while encoding. Stops as soon as the voice is ready or failed.
  const { data: polled } = useQuery({
    queryKey: ["voice", voiceId],
    queryFn: () => Voices.get(voiceId as string),
    enabled: !!voiceId && !startError,
    refetchInterval: (q) =>
      q.state.data && q.state.data.status !== "encoding" ? false : 2000,
  });

  // DERIVED, not mirrored: the server row is the source of truth for where this
  // clone is. Copying its status into state would mean an effect that setStates
  // on every poll, and two things that can disagree.
  const phase: Phase = clone.isPending
    ? "uploading"
    : startError
      ? "failed"
      : !voiceId
        ? "idle"
        : (polled?.status ?? "encoding");
  const error = startError ?? (phase === "failed" ? polled?.error : null) ?? null;

  // Announce the outcome once, and refresh the picker. Toasts and cache
  // invalidation are external systems — the legitimate use for an effect.
  const notified = React.useRef<string | null>(null);
  React.useEffect(() => {
    if (!polled || polled.status === "encoding") return;
    if (notified.current === polled.id) return;
    notified.current = polled.id;
    if (polled.status === "ready") {
      toast.success(`Voice “${polled.displayName}” is ready`);
    }
    qc.invalidateQueries({ queryKey: ["voices", engine] });
  }, [polled, engine, qc]);

  const busy = phase === "uploading" || phase === "encoding";
  const canSubmit =
    !!file &&
    displayName.trim().length > 0 &&
    transcript.trim().length > 0 &&
    nameValid &&
    consent &&
    !durationOutOfRange &&
    !busy;

  function handleOpenChange(v: boolean) {
    // Closing mid-encode is fine — the job continues server-side and the voice
    // turns up in the picker on its own. Only the local progress view is lost.
    setOpen(v);
    if (!v) reset();
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      {/* `trigger` only overrides the button's LOOK — the label stays here so a
          caller can't accidentally render an empty, unlabelled button. */}
      <DialogTrigger render={trigger ?? <Button variant="outline" size="sm" />}>
        <AudioLinesIcon className="size-3.5" aria-hidden />
        {triggerLabel}
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Clone a voice</DialogTitle>
          <DialogDescription>
            Upload 5-10 seconds of clean speech and the exact words spoken. The
            new voice becomes selectable on any agent once it finishes encoding.
          </DialogDescription>
        </DialogHeader>

        {phase === "ready" ? (
          <div className="flex flex-col items-center gap-3 py-6 text-center">
            <CheckCircle2Icon className="size-8 text-emerald-500" aria-hidden />
            <p className="text-sm font-medium">
              “{displayName}” is ready to use
            </p>
            <p className="text-xs text-muted-foreground">
              Pick it in the Voice dropdown of any agent using NeuTTS.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {/* --- audio ------------------------------------------------- */}
            <div className="space-y-1.5">
              <label htmlFor="clone-audio" className="text-sm font-medium">
                Audio clip <span className="text-destructive">*</span>
              </label>
              <Input
                id="clone-audio"
                type="file"
                accept="audio/wav,audio/mpeg,audio/mp3,.wav,.mp3"
                disabled={busy}
                onChange={(e) => onPickFile(e.target.files?.[0] ?? null)}
              />
              <p className="text-xs text-muted-foreground">
                {duration !== null
                  ? `${duration.toFixed(1)}s selected — ${CLONE_MIN_SECONDS}-${CLONE_MAX_SECONDS}s required, 5-10s works best.`
                  : `WAV or MP3, ${CLONE_MIN_SECONDS}-${CLONE_MAX_SECONDS} seconds, one speaker, no background noise.`}
              </p>
              {durationOutOfRange && (
                <p className="text-xs text-destructive">
                  This clip is {duration?.toFixed(1)}s. Trim it to{" "}
                  {CLONE_MIN_SECONDS}-{CLONE_MAX_SECONDS} seconds.
                </p>
              )}
            </div>

            {/* --- transcript -------------------------------------------- */}
            <div className="space-y-1.5">
              <label htmlFor="clone-transcript" className="text-sm font-medium">
                Transcript <span className="text-destructive">*</span>
              </label>
              <Textarea
                id="clone-transcript"
                rows={3}
                disabled={busy}
                value={transcript}
                onChange={(e) => setTranscript(e.target.value)}
                placeholder="Type exactly what is said in the clip, word for word."
              />
              <p className="text-xs text-muted-foreground">
                It must match the audio word for word — the model aligns this text
                against the recording.
              </p>
              {coverage && (
                <p className="flex items-start gap-1.5 text-xs text-warning">
                  <TriangleAlertIcon className="mt-0.5 size-3 shrink-0" aria-hidden />
                  {coverage}
                </p>
              )}
            </div>

            {/* --- naming ------------------------------------------------ */}
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <label htmlFor="clone-display" className="text-sm font-medium">
                  Display name <span className="text-destructive">*</span>
                </label>
                <Input
                  id="clone-display"
                  disabled={busy}
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="Client A — Male"
                />
              </div>
              <div className="space-y-1.5">
                <label htmlFor="clone-name" className="text-sm font-medium">Identifier</label>
                <Input
                  id="clone-name"
                  disabled={busy}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder={slugifyVoiceName(displayName) || "client_a_male"}
                />
                <p
                  className={cn(
                    "text-xs",
                    effectiveName && !nameValid
                      ? "text-destructive"
                      : "text-muted-foreground"
                  )}
                >
                  {effectiveName && !nameValid
                    ? "Use lowercase letters, digits, and underscores only (max 40)."
                    : "Leave blank to derive it from the display name."}
                </p>
              </div>
            </div>

            {/* --- consent ----------------------------------------------- */}
            <label className="flex items-start gap-2.5 rounded-lg border border-border bg-muted/30 px-3 py-2.5">
              <Checkbox
                checked={consent}
                disabled={busy}
                onCheckedChange={(v) => setConsent(v === true)}
                aria-label="Confirm you have the right to clone this voice"
              />
              <span className="text-xs leading-snug text-muted-foreground">
                I have the right to clone this voice — it is my own, or I have the
                speaker&rsquo;s permission to create and use a synthetic copy of it.
              </span>
            </label>

            {/* --- progress / failure ------------------------------------ */}
            {phase === "encoding" && (
              <p className="flex items-center gap-2 text-xs text-muted-foreground">
                <Loader2Icon className="size-3.5 animate-spin" aria-hidden />
                Encoding — this takes a few seconds. You can close this dialog;
                the voice appears in the picker when it&rsquo;s done.
              </p>
            )}
            {phase === "failed" && error && (
              <p className="flex items-start gap-1.5 text-xs text-destructive">
                <TriangleAlertIcon className="mt-0.5 size-3 shrink-0" aria-hidden />
                {error}
              </p>
            )}
          </div>
        )}

        <DialogFooter>
          {phase === "ready" ? (
            <Button onClick={() => handleOpenChange(false)}>Done</Button>
          ) : (
            <>
              <Button
                variant="outline"
                onClick={() => handleOpenChange(false)}
                disabled={phase === "uploading"}
              >
                {busy ? "Close" : "Cancel"}
              </Button>
              <Button
                onClick={() => clone.mutate()}
                disabled={!canSubmit}
              >
                {phase === "uploading" ? (
                  <>
                    <Loader2Icon className="size-4 animate-spin" aria-hidden />
                    Uploading…
                  </>
                ) : (
                  <>
                    <UploadIcon className="size-4" aria-hidden />
                    Clone voice
                  </>
                )}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
