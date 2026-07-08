"use client";

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import Link from "next/link";
import {
  MoreHorizontalIcon,
  BotIcon,
  PencilIcon,
  CopyIcon,
  Trash2Icon,
  QuoteIcon,
  MessageSquareText,
  EarOff,
  Radio,
  Zap,
  PhoneForwarded,
  Clock,
  ArrowRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from "@/components/ui/alert-dialog";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Assistants } from "@/lib/api/resources";
import { toastApiError } from "@/lib/api/errors";
import { cn } from "@/lib/utils";
import type { Assistant } from "@/lib/api/schemas";
import { CardEngineChain } from "@/components/assistants/card-engine-chain";
import {
  providerLabel,
  modelLabel,
  sttLabel,
  ttsLabel,
  relativeTime,
  absoluteTime,
} from "@/components/assistants/card-helpers";

interface AssistantCardProps {
  assistant: Assistant;
}

/* Compact capability chip — icon + label. `on` toggles emphasis vs muted. */
function CapabilityChip({
  icon: Icon,
  label,
  on,
  tone = "neutral",
}: {
  icon: typeof BotIcon;
  label: string;
  on: boolean;
  tone?: "neutral" | "violet" | "amber" | "emerald";
}) {
  const toneOn: Record<string, string> = {
    neutral: "border-border bg-muted/60 text-foreground/80",
    violet: "border-violet-500/30 bg-violet-500/10 text-violet-400",
    amber: "border-amber-500/30 bg-amber-500/10 text-amber-400",
    emerald: "border-emerald-500/30 bg-emerald-500/10 text-emerald-400",
  };
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] font-medium transition-colors duration-150",
        on
          ? toneOn[tone]
          : "border-dashed border-border/60 bg-transparent text-muted-foreground/60"
      )}
    >
      <Icon className="size-3 shrink-0" aria-hidden />
      {label}
    </span>
  );
}

export function AssistantCard({ assistant }: AssistantCardProps) {
  const qc = useQueryClient();
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [duplicating, setDuplicating] = useState(false);

  async function handleDuplicate() {
    if (duplicating) return;
    setDuplicating(true);
    try {
      const { id: _id, ...rest } = assistant;
      await Assistants.create({ ...rest, name: `${assistant.name} (copy)` });
      await qc.invalidateQueries({ queryKey: ["assistants"] });
      toast.success(`Duplicated "${assistant.name}"`);
    } catch (err) {
      toastApiError(err, "Couldn't duplicate assistant");
    } finally {
      setDuplicating(false);
    }
  }

  async function handleDelete() {
    if (!assistant.id || deleting) return;
    setDeleting(true);
    try {
      await Assistants.remove(assistant.id);
      // Close BEFORE the list refetch unmounts this card. A Base UI dialog that
      // unmounts while still open skips its close cleanup and leaves the
      // document inert (pointer-events:none) — killing every click.
      setDeleteOpen(false);
      await qc.invalidateQueries({ queryKey: ["assistants"] });
      toast.success(`Deleted "${assistant.name}"`);
    } catch (err) {
      toastApiError(err, "Couldn't delete assistant");
    } finally {
      setDeleting(false);
    }
  }

  const prompt = (assistant.systemPrompt ?? "").trim();
  const wordCount = prompt ? prompt.split(/\s+/).length : 0;
  const created = relativeTime(assistant.created_at);

  const speaksFirst = assistant.firstMessageEnabled !== false;
  const firstMsg = (assistant.firstMessage ?? "").trim();

  return (
    <div
      className={cn(
        "group relative flex min-w-0 flex-col overflow-hidden rounded-xl border border-border bg-card",
        "shadow-xs transition-all duration-200",
        "hover:border-primary/30 hover:shadow-md focus-within:border-ring/50"
      )}
    >
      {/* Accent hairline — appears on hover, grounds the card to the brand */}
      <span
        aria-hidden
        className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary/40 to-transparent opacity-0 transition-opacity duration-200 group-hover:opacity-100"
      />

      {/* ── Header ──────────────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-2 p-4 pb-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <div className="relative flex size-9 shrink-0 items-center justify-center rounded-lg border border-primary/20 bg-primary/10">
            <BotIcon className="size-4 text-primary" aria-hidden />
          </div>
          <div className="min-w-0">
            <Link
              href={`/assistants/${assistant.id}`}
              className="block truncate text-sm font-semibold text-foreground transition-colors duration-150 hover:text-primary focus:outline-none focus-visible:underline"
            >
              {assistant.name}
            </Link>
            <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
              <Clock className="size-2.5" aria-hidden />
              {created ? (
                <Tooltip>
                  <TooltipTrigger
                    render={
                      <span className="cursor-default">Created {created}</span>
                    }
                  />
                  <TooltipContent>{absoluteTime(assistant.created_at)}</TooltipContent>
                </Tooltip>
              ) : (
                <span title="Creation date unavailable">Created —</span>
              )}
            </span>
          </div>
        </div>

        <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Open assistant actions"
                  className="shrink-0 opacity-0 transition-opacity duration-150 group-hover:opacity-100 focus:opacity-100 [@media(pointer:coarse)]:opacity-100"
                />
              }
            >
              <MoreHorizontalIcon className="size-4" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem render={<Link href={`/assistants/${assistant.id}`} />}>
                <PencilIcon className="size-3.5" aria-hidden />
                Edit
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleDuplicate} disabled={duplicating}>
                <CopyIcon className="size-3.5" aria-hidden />
                {duplicating ? "Duplicating…" : "Duplicate"}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              {/*
                Controlled AlertDialog driven from the menu item via onClick —
                NOT <AlertDialogTrigger render={<DropdownMenuItem/>}>, which made
                a native-button trigger render a div and logged a Base UI
                nativeButton warning once per card. Base UI menu items fire
                onClick (not onSelect).
              */}
              <DropdownMenuItem
                variant="destructive"
                onClick={() => setDeleteOpen(true)}
              >
                <Trash2Icon className="size-3.5" aria-hidden />
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete assistant?</AlertDialogTitle>
              <AlertDialogDescription>
                This will permanently remove &ldquo;{assistant.name}&rdquo;. This
                action cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                variant="destructive"
                onClick={handleDelete}
                disabled={deleting}
              >
                {deleting ? "Deleting…" : "Delete"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>

      {/* ── System prompt — the focal point ─────────────────────── */}
      <div className="px-4">
        <div className="relative rounded-lg border border-border/70 bg-muted/30 p-3">
          {/* Left accent rail */}
          <span
            aria-hidden
            className="absolute inset-y-2 left-0 w-0.5 rounded-full bg-primary/40"
          />
          <div className="flex items-center justify-between gap-2 pl-2">
            <span className="flex items-center gap-1 text-[9px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
              <QuoteIcon className="size-2.5" aria-hidden />
              System prompt
            </span>
            <span className="tabular shrink-0 rounded-sm bg-muted px-1.5 py-0.5 text-[9px] font-medium tracking-wide text-muted-foreground">
              {wordCount} {wordCount === 1 ? "word" : "words"}
            </span>
          </div>
          {prompt ? (
            <p className="mt-1.5 line-clamp-3 pl-2 text-xs leading-relaxed text-foreground/75">
              {prompt}
            </p>
          ) : (
            <p className="mt-1.5 pl-2 text-xs italic text-muted-foreground/60">
              No system prompt set.
            </p>
          )}
          {prompt.length > 140 && (
            <Popover>
              <PopoverTrigger
                render={
                  <button
                    type="button"
                    className="mt-1.5 ml-2 inline-flex items-center gap-0.5 rounded text-[10px] font-medium text-primary transition-colors hover:text-primary/80 focus:outline-none focus-visible:underline"
                  />
                }
              >
                Read full prompt
                <ArrowRight className="size-2.5" aria-hidden />
              </PopoverTrigger>
              <PopoverContent align="start" className="w-80">
                <p className="flex items-center gap-1 text-[9px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                  <QuoteIcon className="size-2.5" aria-hidden />
                  System prompt · {assistant.name}
                </p>
                <p className="max-h-72 overflow-y-auto whitespace-pre-wrap text-xs leading-relaxed text-foreground/85">
                  {prompt}
                </p>
              </PopoverContent>
            </Popover>
          )}
        </div>
      </div>

      {/* ── Engine pipeline (STT → LLM → TTS) ───────────────────── */}
      <div className="px-4 pt-3">
        <CardEngineChain
          sttEngine={assistant.stt?.engine ?? "deepgram"}
          sttLabel={sttLabel(assistant.stt?.engine)}
          llmProvider={assistant.llm?.provider ?? "openai"}
          llmLabel={`${providerLabel(assistant.llm?.provider)} · ${modelLabel(
            assistant.llm?.provider,
            assistant.llm?.model
          )}`}
          ttsEngine={assistant.tts?.engine ?? "kokoro"}
          ttsLabel={ttsLabel(assistant.tts?.engine)}
        />
      </div>

      {/* ── Capability chips ────────────────────────────────────── */}
      <div className="mt-auto flex flex-wrap items-center gap-1.5 p-4 pt-3">
        {speaksFirst ? (
          firstMsg ? (
            <Tooltip>
              <TooltipTrigger
                render={
                  <span className="inline-flex cursor-default items-center gap-1 rounded-md border border-violet-500/30 bg-violet-500/10 px-1.5 py-0.5 text-[10px] font-medium text-violet-400">
                    <MessageSquareText className="size-3 shrink-0" aria-hidden />
                    Speaks first
                  </span>
                }
              />
              <TooltipContent className="max-w-xs">
                &ldquo;{firstMsg}&rdquo;
              </TooltipContent>
            </Tooltip>
          ) : (
            <CapabilityChip icon={MessageSquareText} label="Speaks first" on tone="violet" />
          )
        ) : (
          <CapabilityChip icon={MessageSquareText} label="Caller first" on={false} />
        )}

        <CapabilityChip
          icon={assistant.allowInterruptions === false ? EarOff : Radio}
          label={assistant.allowInterruptions === false ? "No barge-in" : "Barge-in"}
          on={assistant.allowInterruptions !== false}
        />
        <CapabilityChip
          icon={Zap}
          label="Prewarm"
          on={assistant.prewarm === true}
          tone="amber"
        />
        <CapabilityChip
          icon={PhoneForwarded}
          label="Transfer"
          on={assistant.transfer?.enabled === true}
          tone="emerald"
        />
      </div>
    </div>
  );
}
