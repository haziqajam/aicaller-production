"use client";

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import Link from "next/link";
import {
  MoreHorizontalIcon,
  WorkflowIcon,
  PencilIcon,
  CopyIcon,
  Trash2Icon,
  Clock,
  CircleDotIcon,
  ArrowRightIcon,
  MicIcon,
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
import { Flows } from "@/lib/api/resources";
import { toastApiError } from "@/lib/api/errors";
import { cn } from "@/lib/utils";
import type { Flow } from "@/lib/api/schemas";
import { CardEngineChain } from "@/components/assistants/card-engine-chain";
import {
  providerLabel,
  modelLabel,
  sttLabel,
  ttsLabel,
  relativeTime,
} from "@/components/assistants/card-helpers";
import { FlowCallDialog } from "@/components/flow-call-dialog";

/**
 * Card for one Pipecat Flow — mirrors AssistantCard (same Base UI conventions:
 * controlled AlertDialog opened from a menu item onClick, close-before-refetch
 * on delete so the dialog never unmounts while open).
 */
export function FlowCard({ flow }: { flow: Flow }) {
  const qc = useQueryClient();
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [duplicating, setDuplicating] = useState(false);
  const [testOpen, setTestOpen] = useState(false);

  async function handleDuplicate() {
    if (duplicating) return;
    setDuplicating(true);
    try {
      const { id: _id, ...rest } = flow;
      await Flows.create({ ...rest, name: `${flow.name} (copy)` });
      await qc.invalidateQueries({ queryKey: ["flows"] });
      toast.success(`Duplicated "${flow.name}"`);
    } catch (err) {
      toastApiError(err, "Couldn't duplicate flow");
    } finally {
      setDuplicating(false);
    }
  }

  async function handleDelete() {
    if (!flow.id || deleting) return;
    setDeleting(true);
    try {
      await Flows.remove(flow.id);
      // Close BEFORE the list refetch unmounts this card (Base UI dialogs that
      // unmount while open leave the document inert).
      setDeleteOpen(false);
      await qc.invalidateQueries({ queryKey: ["flows"] });
      toast.success(`Deleted "${flow.name}"`);
    } catch (err) {
      toastApiError(err, "Couldn't delete flow");
    } finally {
      setDeleting(false);
    }
  }

  const nodes = flow.nodes ?? [];
  const edgeCount = nodes.reduce(
    (n, node) => n + node.functions.filter((f) => f.transition_to).length, 0);
  const created = relativeTime(flow.created_at);

  return (
    <div
      className={cn(
        "group relative flex min-w-0 flex-col overflow-hidden rounded-xl border border-border bg-card",
        "shadow-xs transition-all duration-200",
        "hover:border-primary/30 hover:shadow-md focus-within:border-ring/50"
      )}
    >
      <span
        aria-hidden
        className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary/40 to-transparent opacity-0 transition-opacity duration-200 group-hover:opacity-100"
      />

      {/* ── Header ──────────────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-2 p-4 pb-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <div className="relative flex size-9 shrink-0 items-center justify-center rounded-lg border border-primary/20 bg-primary/10">
            <WorkflowIcon className="size-4 text-primary" aria-hidden />
          </div>
          <div className="min-w-0">
            <Link
              href={`/flows/${flow.id}`}
              className="block truncate text-sm font-semibold text-foreground transition-colors duration-150 hover:text-primary focus:outline-none focus-visible:underline"
            >
              {flow.name}
            </Link>
            <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
              <Clock className="size-2.5" aria-hidden />
              {created ? `Created ${created}` : "Created —"}
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
                  aria-label="Open flow actions"
                  className="shrink-0 opacity-0 transition-opacity duration-150 group-hover:opacity-100 focus:opacity-100 [@media(pointer:coarse)]:opacity-100"
                />
              }
            >
              <MoreHorizontalIcon className="size-4" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem render={<Link href={`/flows/${flow.id}`} />}>
                <PencilIcon className="size-3.5" aria-hidden />
                Edit
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setTestOpen(true)}>
                <MicIcon className="size-3.5" aria-hidden />
                Test call
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleDuplicate} disabled={duplicating}>
                <CopyIcon className="size-3.5" aria-hidden />
                {duplicating ? "Duplicating…" : "Duplicate"}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
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
              <AlertDialogTitle>Delete flow?</AlertDialogTitle>
              <AlertDialogDescription>
                This will permanently remove &ldquo;{flow.name}&rdquo; and detach
                it from any campaigns. This action cannot be undone.
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

      {/* Always-mounted test dialog (never conditionally unmounted while open). */}
      <FlowCallDialog
        open={testOpen}
        onOpenChange={setTestOpen}
        defaultFlowId={flow.id}
      />

      {/* ── Graph summary ───────────────────────────────────────── */}
      <div className="px-4">
        <div className="relative rounded-lg border border-border/70 bg-muted/30 p-3">
          <span
            aria-hidden
            className="absolute inset-y-2 left-0 w-0.5 rounded-full bg-primary/40"
          />
          <div className="flex items-center justify-between gap-2 pl-2">
            <span className="flex items-center gap-1 text-[9px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
              <WorkflowIcon className="size-2.5" aria-hidden />
              Conversation graph
            </span>
            <span className="tabular shrink-0 rounded-sm bg-muted px-1.5 py-0.5 text-[9px] font-medium tracking-wide text-muted-foreground">
              {nodes.length} {nodes.length === 1 ? "node" : "nodes"} · {edgeCount}{" "}
              {edgeCount === 1 ? "transition" : "transitions"}
            </span>
          </div>
          {flow.description ? (
            <p className="mt-1.5 line-clamp-2 pl-2 text-xs leading-relaxed text-foreground/75">
              {flow.description}
            </p>
          ) : (
            <p className="mt-1.5 flex items-center gap-1 pl-2 text-xs text-muted-foreground/70">
              <CircleDotIcon className="size-3 text-primary/60" aria-hidden />
              Starts at
              <span className="font-mono text-foreground/70">{flow.initial_node}</span>
              <ArrowRightIcon className="size-3" aria-hidden />
              {nodes.length > 1 ? `${nodes.length - 1} more` : "done"}
            </p>
          )}
        </div>
      </div>

      {/* ── Engine pipeline (STT → LLM → TTS) ───────────────────── */}
      <div className="mt-auto px-4 py-4 pt-3">
        <CardEngineChain
          sttEngine={flow.stt?.engine ?? "deepgram"}
          sttLabel={sttLabel(flow.stt?.engine)}
          llmProvider={flow.llm?.provider ?? "openai"}
          llmLabel={`${providerLabel(flow.llm?.provider)} · ${modelLabel(
            flow.llm?.provider,
            flow.llm?.model
          )}`}
          ttsEngine={flow.tts?.engine ?? "kokoro"}
          ttsLabel={ttsLabel(flow.tts?.engine)}
        />
      </div>
    </div>
  );
}
