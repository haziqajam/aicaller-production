"use client";

import * as React from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import Link from "next/link";
import { Numbers } from "@/lib/api/resources";
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
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  LinkIcon,
  PhoneIcon,
  CheckIcon,
  XIcon,
  ArrowRightIcon,
} from "lucide-react";

export interface NumberRecord {
  id: string;
  phoneNumber?: string;
  phone_number?: string;
  friendlyName?: string;
  friendly_name?: string;
  assistantId?: string;
  assistant_id?: string;
}

export function numberLabel(n: NumberRecord): string {
  return (
    n.friendlyName ?? n.friendly_name ?? n.phoneNumber ?? n.phone_number ?? n.id
  );
}

export function numberAssistantId(n: NumberRecord): string | undefined {
  return n.assistantId ?? n.assistant_id ?? undefined;
}

/**
 * Attach (or reassign) a purchased phone number to this agent. Selecting a
 * number that is currently routed elsewhere reassigns it (an UPDATE); selecting
 * an unrouted number is a fresh attach (CREATE). Persists via Numbers.map,
 * keyed by the number's _id.
 */
export function AttachNumberDialog({
  agentId,
  agentName,
  numbers,
  assistantNames,
}: {
  agentId: string;
  agentName: string;
  numbers: NumberRecord[];
  assistantNames: Map<string, string>;
}) {
  const qc = useQueryClient();
  const [open, setOpen] = React.useState(false);
  const [selectedId, setSelectedId] = React.useState<string | null>(null);

  const attach = useMutation({
    mutationFn: (numberId: string) => Numbers.map(numberId, agentId),
    onSuccess: () => {
      toast.success(`Number attached to ${agentName}`);
      qc.invalidateQueries({ queryKey: ["numbers"] });
      setOpen(false);
      setSelectedId(null);
    },
    onError: (err) => toastApiError(err, "Couldn't attach number"),
  });

  // Numbers not already routed to this agent are the candidates.
  const candidates = numbers.filter((n) => numberAssistantId(n) !== agentId);

  function handleOpenChange(v: boolean) {
    setOpen(v);
    if (!v) setSelectedId(null);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger render={<Button variant="outline" size="sm" />}>
        <LinkIcon className="size-4" aria-hidden />
        Attach number
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Attach a number to {agentName}</DialogTitle>
          <DialogDescription>
            Inbound calls to the chosen number will be answered by this agent.
          </DialogDescription>
        </DialogHeader>

        {numbers.length === 0 ? (
          <div className="rounded-lg border border-border bg-muted/30 px-3 py-6 text-center text-sm text-muted-foreground">
            No phone numbers purchased yet.
            <br />
            <Button
              variant="link"
              size="sm"
              className="h-auto p-0"
              render={<Link href="/numbers" />}
            >
              Buy a number
            </Button>{" "}
            first.
          </div>
        ) : candidates.length === 0 ? (
          <div className="rounded-lg border border-border bg-muted/30 px-3 py-6 text-center text-sm text-muted-foreground">
            Every purchased number is already routed to this agent.
          </div>
        ) : (
          <div className="max-h-72 space-y-1.5 overflow-y-auto">
            {candidates.map((n) => {
              const routedTo = numberAssistantId(n);
              const routedName = routedTo
                ? assistantNames.get(routedTo)
                : undefined;
              const isSelected = selectedId === n.id;
              return (
                <button
                  key={n.id}
                  type="button"
                  onClick={() => setSelectedId(n.id)}
                  className={cn(
                    "flex w-full items-center justify-between gap-3 rounded-lg border px-3 py-2 text-left transition-colors",
                    isSelected
                      ? "border-primary bg-primary/5"
                      : "border-border hover:bg-muted/40"
                  )}
                >
                  <span className="flex min-w-0 items-center gap-2">
                    <PhoneIcon
                      className="size-3.5 shrink-0 text-muted-foreground"
                      aria-hidden
                    />
                    <span className="tabular truncate text-sm font-medium text-foreground">
                      {numberLabel(n)}
                    </span>
                  </span>
                  <span className="flex shrink-0 items-center gap-2">
                    {routedTo ? (
                      <span className="text-[11px] text-muted-foreground">
                        routed to {routedName ?? "another agent"} — will reassign
                      </span>
                    ) : (
                      <span className="text-[11px] text-muted-foreground">
                        unrouted
                      </span>
                    )}
                    {isSelected && (
                      <CheckIcon className="size-4 text-primary" aria-hidden />
                    )}
                  </span>
                </button>
              );
            })}
          </div>
        )}

        <DialogFooter showCloseButton>
          {candidates.length > 0 && (
            <Button
              onClick={() => selectedId && attach.mutate(selectedId)}
              disabled={!selectedId || attach.isPending}
            >
              {attach.isPending ? "Attaching…" : "Attach"}
              <ArrowRightIcon className="size-4" aria-hidden />
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Detach a number from its agent (DELETE the inbound route) — sets the number's
 * assistantId to "" so inbound calls to it are no longer answered.
 */
export function DetachNumberButton({
  numberId,
  label,
  agentName,
}: {
  numberId: string;
  label: string;
  agentName: string;
}) {
  const qc = useQueryClient();
  const [open, setOpen] = React.useState(false);

  const detach = useMutation({
    mutationFn: () => Numbers.map(numberId, ""),
    onSuccess: () => {
      toast.success("Number detached");
      qc.invalidateQueries({ queryKey: ["numbers"] });
      setOpen(false);
    },
    onError: (err) => toastApiError(err, "Couldn't detach number"),
  });

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger
        render={
          <button
            type="button"
            aria-label={`Detach ${label}`}
            className="ml-1 inline-flex size-4 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-destructive/15 hover:text-destructive"
          />
        }
      >
        <XIcon className="size-3" aria-hidden />
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Detach {label}?</AlertDialogTitle>
          <AlertDialogDescription>
            Inbound calls to this number will no longer reach {agentName}. You
            can re-attach it to any agent later.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            onClick={() => detach.mutate()}
            disabled={detach.isPending}
          >
            {detach.isPending ? "Detaching…" : "Detach"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
