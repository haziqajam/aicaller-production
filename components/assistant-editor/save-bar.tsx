"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogAction,
  AlertDialogCancel,
} from "@/components/ui/alert-dialog";

interface SaveBarProps {
  isDirty: boolean;
  isSaving: boolean;
  /** Called when the user clicks "Save changes". The caller is responsible
   *  for running validation, persisting, and toasting. */
  onSave: () => void;
}

/**
 * Sticky bottom bar that shows dirty-state and triggers save.
 *
 * The actual API call lives in EditorForm — this component only fires
 * the provided `onSave` callback (which is `form.handleSubmit(saveData)`).
 */
export function SaveBar({ isDirty, isSaving, onSave }: SaveBarProps) {
  const [discardOpen, setDiscardOpen] = useState(false);
  if (!isDirty && !isSaving) return null;

  return (
    <div
      className="fixed bottom-0 left-0 right-0 z-40 flex w-full items-center justify-between gap-4 border-t border-border bg-background/95 px-4 py-3 backdrop-blur supports-backdrop-filter:bg-background/80 safe-bottom"
      role="status"
      aria-label="Unsaved changes"
    >
      <p className="min-w-0 truncate text-sm text-muted-foreground">
        {isSaving ? "Saving…" : "You have unsaved changes"}
      </p>
      <div className="flex shrink-0 items-center gap-2">
        {/* Confirm before discarding — a misclick shouldn't wipe edits. */}
        <AlertDialog open={discardOpen} onOpenChange={setDiscardOpen}>
          <Button variant="outline" size="sm" disabled={isSaving}
            onClick={() => setDiscardOpen(true)}>
            Discard
          </Button>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Discard unsaved changes?</AlertDialogTitle>
              <AlertDialogDescription>
                This reverts every field to the last saved state. This cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Keep editing</AlertDialogCancel>
              <AlertDialogAction variant="destructive" onClick={() => window.location.reload()}>
                Discard changes
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
        <Button
          size="sm"
          disabled={isSaving}
          onClick={onSave}
        >
          {isSaving ? "Saving…" : "Save changes"}
        </Button>
      </div>
    </div>
  );
}

/**
 * Hook that intercepts link-clicks when the form is dirty and
 * shows the unsaved-changes dialog.
 */
export function useDirtyGuard(isDirty: boolean) {
  const [guardOpen, setGuardOpen] = useState(false);
  const [pendingHref, setPendingHref] = useState<string | null>(null);
  const router = useRouter();

  const navigate = useCallback(
    (href: string) => {
      if (isDirty) {
        setPendingHref(href);
        setGuardOpen(true);
      } else {
        router.push(href);
      }
    },
    [isDirty, router]
  );

  const GuardDialog = useCallback(
    () => (
      <AlertDialog open={guardOpen} onOpenChange={setGuardOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Leave without saving?</AlertDialogTitle>
            <AlertDialogDescription>
              You have unsaved changes. If you leave now those changes will be
              lost.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setGuardOpen(false)}>
              Stay
            </AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                setGuardOpen(false);
                if (pendingHref) router.push(pendingHref);
              }}
            >
              Leave
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    ),
    [guardOpen, pendingHref, router]
  );

  return { navigate, GuardDialog };
}
