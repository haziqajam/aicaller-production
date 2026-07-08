"use client";

import * as React from "react";
import Link from "next/link";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { NumberLists } from "@/lib/api/resources";
import type { NumberList } from "@/lib/api/schemas";
import { toastApiError } from "@/lib/api/errors";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { PlusIcon, Trash2Icon, ChevronRightIcon, PhoneIcon } from "lucide-react";

function CreateListDialog({ onCreated }: { onCreated: () => void }) {
  const [open, setOpen] = React.useState(false);
  const [name, setName] = React.useState("");
  const [description, setDescription] = React.useState("");
  const openDialog = () => { setName(""); setDescription(""); setOpen(true); };
  const create = useMutation({
    mutationFn: () => NumberLists.create({ name: name.trim(), description }),
    onSuccess: () => { setOpen(false); toast.success("List created"); onCreated(); },
    onError: (e) => toastApiError(e),
  });
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button onClick={openDialog}><PlusIcon className="size-4" />New list</Button>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New number list</DialogTitle>
          <DialogDescription>A reusable group of your Twilio numbers. Plug a list into a campaign to dial from it — and optionally rotate across the numbers. You buy and manage the numbers inside the list.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Name</label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. US outbound pool" />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Description (optional)</label>
            <Textarea rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={create.isPending}>Cancel</Button>
          <Button onClick={() => create.mutate()} disabled={create.isPending || !name.trim()}>
            {create.isPending ? "Creating…" : "Create list"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function NumbersPage() {
  const qc = useQueryClient();
  const onChanged = () => qc.invalidateQueries({ queryKey: ["number-lists"] });
  const { data: lists, isLoading } = useQuery<NumberList[]>({ queryKey: ["number-lists"], queryFn: NumberLists.list });
  const del = useMutation({
    mutationFn: (id: string) => NumberLists.remove(id),
    onSuccess: (res) => {
      // Deleting a list releases its member numbers back to Twilio. Surface how
      // many were released and warn about any that couldn't be (e.g. still routed
      // to an agent for inbound).
      const released = res?.releasedCount ?? 0;
      const failed = res?.failed?.length ?? 0;
      if (failed) {
        toast.warning(
          `List deleted — released ${released}, ${failed} couldn't be released`,
          { description: res?.failed?.[0]?.error },
        );
      } else if (released) {
        toast.success(`List deleted — released ${released} number${released === 1 ? "" : "s"}`);
      } else {
        toast.success("List deleted");
      }
      // Released numbers are gone from the account too.
      qc.invalidateQueries({ queryKey: ["numbers"] });
      onChanged();
    },
    onError: (e) => toastApiError(e),
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Configuration</p>
          <h1 className="mt-0.5 text-base font-semibold text-foreground">Numbers</h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Reusable lists of your Twilio numbers. Open a list to buy, add, or route numbers — then pick the list in a campaign and rotate across it to spread volume.
          </p>
        </div>
        <CreateListDialog onCreated={onChanged} />
      </div>

      {isLoading ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-lg" />)}
        </div>
      ) : !lists || lists.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-14 text-center">
            <div className="flex size-10 items-center justify-center rounded-lg bg-muted">
              <PhoneIcon className="size-5 text-muted-foreground" aria-hidden />
            </div>
            <div className="space-y-1">
              <p className="text-sm font-medium">No number lists yet</p>
              <p className="text-xs text-muted-foreground max-w-xs">
                Create a list, then buy or add numbers into it. Campaigns dial from a list you pick.
              </p>
            </div>
            <CreateListDialog onCreated={onChanged} />
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {lists.map((l) => (
            <Card key={l.id} className="group relative">
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-2">
                  <Link href={`/numbers/${l.id}`} className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-foreground group-hover:text-primary">{l.name}</p>
                    {l.description && <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{l.description}</p>}
                    <Badge variant="secondary" className="mt-2">{l.numberCount} number{l.numberCount === 1 ? "" : "s"}</Badge>
                  </Link>
                  <div className="flex items-center gap-1">
                    <AlertDialog>
                      <AlertDialogTrigger render={
                        <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive">
                          <Trash2Icon className="size-4" />
                        </Button>} />
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Delete &ldquo;{l.name}&rdquo;?</AlertDialogTitle>
                          <AlertDialogDescription>
                            This releases all {l.numberCount} number{l.numberCount === 1 ? "" : "s"} in this list back to Twilio and stops their billing, then deletes the list. Numbers still routed to an agent for inbound are kept (detach them first to release). This cannot be undone.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction onClick={() => l.id && del.mutate(l.id)}
                            className="bg-destructive text-white hover:bg-destructive/90">Delete</AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                    <Link href={`/numbers/${l.id}`}>
                      <Button variant="ghost" size="icon"><ChevronRightIcon className="size-4" /></Button>
                    </Link>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
