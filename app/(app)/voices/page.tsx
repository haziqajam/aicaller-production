"use client";

import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Voices, type Voice } from "@/lib/api/resources";
import { toastApiError } from "@/lib/api/errors";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { CloneVoiceDialog } from "@/components/voices/clone-voice-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  AudioLinesIcon, LockIcon, Loader2Icon, Trash2Icon, TriangleAlertIcon,
} from "lucide-react";

const ENGINE = "neutts";

function StatusBadge({ voice }: { voice: Voice }) {
  if (voice.status === "ready") {
    return <Badge variant="outline">Ready</Badge>;
  }
  if (voice.status === "encoding") {
    return (
      <Badge variant="outline" className="gap-1">
        <Loader2Icon className="size-3 animate-spin" aria-hidden />
        Encoding
      </Badge>
    );
  }
  return (
    <Badge variant="destructive" className="gap-1">
      <TriangleAlertIcon className="size-3" aria-hidden />
      Failed
    </Badge>
  );
}

/**
 * Voice library — the built-in NeuTTS references shared by everyone, plus this
 * account's own cloned voices.
 *
 * Built-ins are baked into the pod image and read-only. Clones live in object
 * storage, so they work on every pod with no rebuild, and deleting one removes
 * its stored files as well.
 */
export default function VoicesPage() {
  const qc = useQueryClient();
  const { data: voices, isPending } = useQuery({
    queryKey: ["voices", ENGINE],
    queryFn: () => Voices.list(ENGINE),
    // Keep polling while anything is mid-encode so a clone flips to Ready on
    // its own; settle back to no polling once everything has landed.
    refetchInterval: (q) =>
      (q.state.data ?? []).some((v: Voice) => v.status === "encoding")
        ? 3000
        : false,
  });

  const remove = useMutation({
    mutationFn: (id: string) => Voices.remove(id),
    onSuccess: () => {
      toast.success("Voice deleted");
      qc.invalidateQueries({ queryKey: ["voices", ENGINE] });
    },
    onError: (err) => toastApiError(err, "Couldn't delete voice"),
  });

  const cloned = (voices ?? []).filter((v) => v.source === "cloned");

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Build"
        title="Voices"
        description="Built-in voices plus your own clones. Any voice here can be selected on an agent using NeuTTS."
        actions={<CloneVoiceDialog engine={ENGINE} />}
      />

      {isPending ? (
        <Card>
          <CardContent className="space-y-2 py-4">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-9 w-full" />
            ))}
          </CardContent>
        </Card>
      ) : (voices ?? []).length === 0 ? (
        <EmptyState
          icon={AudioLinesIcon}
          title="No voices available"
          hint="Clone a voice from a short recording to get started."
          action={<CloneVoiceDialog engine={ENGINE} />}
        />
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Voice</TableHead>
                  <TableHead>Identifier</TableHead>
                  <TableHead>Source</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-10" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {(voices ?? []).map((v) => (
                  <TableRow key={v.id}>
                    <TableCell className="font-medium">
                      {v.displayName}
                      {v.status === "failed" && v.error && (
                        <p className="mt-0.5 text-xs font-normal text-destructive">
                          {v.error}
                        </p>
                      )}
                    </TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">
                      {v.name}
                    </TableCell>
                    <TableCell>
                      {v.source === "builtin" ? (
                        <span className="flex items-center gap-1 text-xs text-muted-foreground">
                          <LockIcon className="size-3" aria-hidden />
                          Built-in
                        </span>
                      ) : (
                        <span className="text-xs text-muted-foreground">Cloned</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <StatusBadge voice={v} />
                    </TableCell>
                    <TableCell>
                      {/* Built-ins are shared by every account and baked into the
                          pod image — the backend refuses to delete them, so we
                          don't offer the action at all. */}
                      {v.source === "cloned" && (
                        <AlertDialog>
                          <AlertDialogTrigger
                            render={
                              <Button
                                variant="ghost"
                                size="icon"
                                aria-label={`Delete ${v.displayName}`}
                              />
                            }
                          >
                            <Trash2Icon className="size-4" aria-hidden />
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>
                                Delete “{v.displayName}”?
                              </AlertDialogTitle>
                              <AlertDialogDescription>
                                The stored recording and its encoded reference are
                                deleted too. Any agent still set to this voice will
                                fall back to a built-in one on its next call.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancel</AlertDialogCancel>
                              <AlertDialogAction
                                onClick={() => remove.mutate(v.id)}
                              >
                                Delete
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {cloned.length === 0 && (voices ?? []).length > 0 && (
        <p className="text-xs text-muted-foreground">
          You haven&rsquo;t cloned any voices yet. A clone needs 5-10 seconds of
          clean speech and its exact transcript.
        </p>
      )}
    </div>
  );
}
