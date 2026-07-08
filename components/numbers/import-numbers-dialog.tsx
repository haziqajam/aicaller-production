"use client";

import * as React from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Numbers, NumberLists } from "@/lib/api/resources";
import { toastApiError } from "@/lib/api/errors";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { DownloadIcon, Loader2Icon } from "lucide-react";

type Row = { id?: string; phoneNumber?: string; source?: string; importable?: boolean };

/**
 * Import numbers that already exist on the active Twilio account but aren't in our
 * DB yet (e.g. bought in the Twilio console). GET /numbers tags these source:"twilio"
 * + importable. Importing creates the DB rows (stamped with the active account) and,
 * when opened from a list, adds them straight into that list.
 */
export function ImportNumbersDialog({ listId, onImported }: { listId?: string; onImported?: () => void }) {
  const qc = useQueryClient();
  const [open, setOpen] = React.useState(false);
  const [selected, setSelected] = React.useState<Set<string>>(new Set());

  const { data, isLoading } = useQuery<Row[]>({
    queryKey: ["numbers-importable"],
    queryFn: Numbers.importable,
    enabled: open,
  });
  const importable = React.useMemo(
    () => (data ?? []).filter((n) => n.phoneNumber),
    [data],
  );

  function toggle(phone: string, on: boolean) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (on) next.add(phone); else next.delete(phone);
      return next;
    });
  }

  const run = useMutation({
    mutationFn: async () => {
      const phones = [...selected];
      const res = await Numbers.importFromTwilio(phones);
      if (listId && res.imported.length) await NumberLists.addNumbers(listId, res.imported);
      return res;
    },
    onSuccess: (res) => {
      const n = res.importedCount ?? res.imported.length;
      if (res.failed?.length) toast.warning(`Imported ${n}, ${res.failed.length} failed`, { description: res.failed[0]?.error });
      else toast.success(`Imported ${n} number${n !== 1 ? "s" : ""}`);
      qc.invalidateQueries({ queryKey: ["numbers"] });
      qc.invalidateQueries({ queryKey: ["numbers-importable"] });
      if (listId) qc.invalidateQueries({ queryKey: ["number-list", listId] });
      qc.invalidateQueries({ queryKey: ["number-lists"] });
      setSelected(new Set());
      setOpen(false);
      onImported?.();
    },
    onError: (err) => toastApiError(err, "Couldn't import numbers"),
  });

  function onOpenChange(next: boolean) {
    setOpen(next);
    if (!next) setSelected(new Set());
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger render={<Button variant="outline" size="sm" />}>
        <DownloadIcon className="size-4" aria-hidden />Import from Twilio
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Import from Twilio</DialogTitle>
          <DialogDescription>
            Numbers already on your active Twilio account that aren’t managed here yet.
            {listId ? " Imported numbers are added to this list." : ""}
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <Skeleton className="h-32 w-full" />
        ) : importable.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border py-6 text-center text-xs text-muted-foreground">
            No unmanaged numbers found on the active account. (Buy one above, or check the
            active account in the navbar.)
          </p>
        ) : (
          <div className="max-h-64 space-y-1 overflow-y-auto">
            {importable.map((n) => {
              const phone = n.phoneNumber as string;
              const on = selected.has(phone);
              return (
                <label key={phone}
                  className="flex cursor-pointer items-center gap-3 rounded-md border border-border px-3 py-2 hover:bg-muted/30">
                  <Checkbox checked={on} onCheckedChange={(c) => toggle(phone, !!c)}
                    aria-label={`Select ${phone}`} />
                  <span className="tabular flex-1 text-sm text-foreground">{phone}</span>
                  <Badge variant="outline" className="text-[10px]">Twilio</Badge>
                </label>
              );
            })}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={() => run.mutate()} disabled={selected.size === 0 || run.isPending}>
            {run.isPending && <Loader2Icon className="size-4 animate-spin" aria-hidden />}
            {run.isPending ? "Importing…" : `Import ${selected.size || ""}`.trim()}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
