"use client";

import * as React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Admin,
  type AdminNumberRecord,
  type UserRecord,
} from "@/lib/api/admin";
import { Assistants } from "@/lib/api/resources";
import type { Assistant } from "@/lib/api/schemas";
import { toastApiError, parseApiError } from "@/lib/api/errors";
import { getRole } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { ShieldIcon, PhoneIcon } from "lucide-react";
import { DataToolbar, useDataToolbar } from "@/components/data-toolbar";

// Base UI's Select rejects empty-string item values, so the "no owner /
// no assistant" choice uses a sentinel that maps back to null on the wire.
const NONE = "__none__";

// ---------- Owner select (inline) ----------

function OwnerSelect({
  num,
  users,
}: {
  num: AdminNumberRecord;
  users: UserRecord[];
}) {
  const qc = useQueryClient();
  const [saving, setSaving] = React.useState(false);
  const current = num.ownerId ?? NONE;

  async function handleChange(value: string | null) {
    if (!value || value === current) return;
    const ownerId = value === NONE ? null : value;
    setSaving(true);
    try {
      await Admin.updateNumber(num.id, { ownerId });
      await qc.invalidateQueries({ queryKey: ["admin-numbers"] });
      toast.success(
        ownerId
          ? `Owner updated for ${num.phoneNumber}`
          : `Owner cleared for ${num.phoneNumber}`
      );
    } catch (err) {
      toastApiError(err, "Couldn't reassign owner");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Select value={current} onValueChange={handleChange} disabled={saving}>
      <SelectTrigger
        className="w-52 transition-opacity duration-150"
        style={{ opacity: saving ? 0.6 : undefined }}
        size="sm"
      >
        <SelectValue placeholder="Unassigned">
          {(value: string) =>
            value && value !== NONE
              ? users.find((u) => u.id === value)?.email ?? value
              : "Unassigned"}
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={NONE}>Unassigned</SelectItem>
        {users.map((u) => (
          <SelectItem key={u.id} value={u.id}>
            {u.email}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

// ---------- Assistant select (inline) ----------

function AssistantSelect({
  num,
  assistants,
}: {
  num: AdminNumberRecord;
  assistants: Assistant[];
}) {
  const qc = useQueryClient();
  const [saving, setSaving] = React.useState(false);
  const current = num.assistantId ?? NONE;

  async function handleChange(value: string | null) {
    if (!value || value === current) return;
    const assistantId = value === NONE ? null : value;
    setSaving(true);
    try {
      await Admin.updateNumber(num.id, { assistantId });
      await qc.invalidateQueries({ queryKey: ["admin-numbers"] });
      toast.success(
        assistantId
          ? `Assistant updated for ${num.phoneNumber}`
          : `Assistant cleared for ${num.phoneNumber}`
      );
    } catch (err) {
      toastApiError(err, "Couldn't reassign assistant");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Select value={current} onValueChange={handleChange} disabled={saving}>
      <SelectTrigger
        className="w-52 transition-opacity duration-150"
        style={{ opacity: saving ? 0.6 : undefined }}
        size="sm"
      >
        <SelectValue placeholder="None">
          {(value: string) =>
            value && value !== NONE
              ? assistants.find((a) => a.id === value)?.name ?? value
              : "None"}
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={NONE}>None</SelectItem>
        {assistants.map((a) => (
          <SelectItem key={a.id ?? a.name} value={a.id ?? ""}>
            {a.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

// ---------- Delete alert-dialog ----------

function DeleteNumberButton({ num }: { num: AdminNumberRecord }) {
  const qc = useQueryClient();
  const [loading, setLoading] = React.useState(false);
  const [open, setOpen] = React.useState(false);

  async function handleDelete() {
    setLoading(true);
    try {
      await Admin.deleteNumber(num.id);
      // Close BEFORE the list refetch unmounts this row (and its dialog). A
      // Base UI dialog that unmounts while still open skips its close cleanup
      // and leaves the document inert (pointer-events:none) — killing every
      // click, including the sidebar.
      setOpen(false);
      await qc.invalidateQueries({ queryKey: ["admin-numbers"] });
      toast.success(`${num.phoneNumber} removed from the pool`);
    } catch (err) {
      toastApiError(err, "Couldn't remove number");
    } finally {
      setLoading(false);
    }
  }

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger render={<Button variant="destructive" size="sm" />}>
        Remove
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Remove this number?</AlertDialogTitle>
          <AlertDialogDescription>
            This removes <strong>{num.phoneNumber}</strong> from the number
            pool. Any campaigns relying on it will no longer be able to place
            calls from this number.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            onClick={handleDelete}
            disabled={loading}
          >
            {loading ? "Removing…" : "Remove"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

// ---------- Table skeleton ----------

function NumbersTableSkeleton() {
  return (
    <div className="rounded-lg border border-border overflow-hidden">
      <div className="divide-y divide-border">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex items-center gap-4 px-3 py-2.5">
            <Skeleton className="h-4 w-36" />
            <Skeleton className="h-7 w-52" />
            <Skeleton className="h-7 w-52" />
            <Skeleton className="ml-auto h-7 w-20" />
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------- Main page (role gate) ----------

export default function AdminNumbersPage() {
  const role = getRole();

  if (role !== "admin") {
    return (
      <div className="flex flex-1 items-center justify-center py-20">
        <Card className="w-full max-w-sm">
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
            <div className="flex size-10 items-center justify-center rounded-lg bg-muted">
              <ShieldIcon className="size-5 text-muted-foreground" aria-hidden />
            </div>
            <div className="space-y-1">
              <p className="text-sm font-semibold">Not authorized</p>
              <p className="text-xs text-muted-foreground max-w-xs">
                Admin access is required to manage phone numbers. Contact your
                administrator to request elevated permissions.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return <AdminNumbersContent />;
}

// Inner component — only rendered for admins, safe to call Admin.*
function AdminNumbersContent() {
  const {
    data: numbersData,
    isLoading,
    isError,
    error,
  } = useQuery<AdminNumberRecord[]>({
    queryKey: ["admin-numbers"],
    queryFn: Admin.listNumbers,
  });

  const { data: usersData } = useQuery<UserRecord[]>({
    queryKey: ["admin-users"],
    queryFn: Admin.listUsers,
  });

  const { data: assistantsData } = useQuery<Assistant[]>({
    queryKey: ["assistants"],
    queryFn: Assistants.list,
  });

  const numbers: AdminNumberRecord[] = numbersData ?? [];
  const users: UserRecord[] = usersData ?? [];
  const assistants: Assistant[] = assistantsData ?? [];
  const isEmpty = !isLoading && !isError && numbers.length === 0;

  const tb = useDataToolbar(numbers, {
    search: (n) =>
      `${n.phoneNumber} ${n.ownerEmail ?? ""} ${n.assistantName ?? ""}`,
    facets: [
      {
        key: "owner",
        label: "Owner",
        options: [
          { value: "assigned", label: "Assigned" },
          { value: "unassigned", label: "Unassigned" },
        ],
        get: (n) => (n.ownerId ? "assigned" : "unassigned"),
      },
      {
        key: "assistant",
        label: "Assistant",
        options: [
          { value: "assigned", label: "Assigned" },
          { value: "none", label: "None" },
        ],
        get: (n) => (n.assistantId ? "assigned" : "none"),
      },
    ],
  });
  const noMatches =
    !isLoading && !isError && numbers.length > 0 && tb.filtered.length === 0;

  return (
    <div className="space-y-4">
      {/* ── Page header ──────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            Admin
          </p>
          <h1 className="mt-0.5 text-base font-semibold text-foreground">
            Phone Numbers
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Manage every number in the pool — reassign owners and assistants, or
            remove numbers entirely.
          </p>
        </div>
      </div>

      {/* ── Loading skeletons ─────────────────────────────────── */}
      {isLoading && <NumbersTableSkeleton />}

      {/* ── Error state ───────────────────────────────────────── */}
      {isError && (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            {parseApiError(error, "Couldn't load phone numbers.")}
          </CardContent>
        </Card>
      )}

      {/* ── Empty state ───────────────────────────────────────── */}
      {isEmpty && (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-14 text-center">
            <div className="flex size-10 items-center justify-center rounded-lg bg-muted">
              <PhoneIcon className="size-5 text-muted-foreground" aria-hidden />
            </div>
            <div className="space-y-1">
              <p className="text-sm font-medium">No phone numbers yet</p>
              <p className="text-xs text-muted-foreground max-w-xs">
                Once users purchase or provision numbers, they will appear here
                for you to reassign or remove.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Toolbar + numbers table ───────────────────────────── */}
      {!isLoading && !isError && numbers.length > 0 && (
        <div className="space-y-4">
          <DataToolbar
            {...tb.toolbarProps}
            noun="number"
            searchPlaceholder="Search by number, owner, assistant…"
          />

          {/* No-match state — list has rows but filters exclude them all */}
          {noMatches ? (
            <Card>
              <CardContent className="flex flex-col items-center gap-3 py-14 text-center">
                <div className="flex size-10 items-center justify-center rounded-lg bg-muted">
                  <PhoneIcon
                    className="size-5 text-muted-foreground"
                    aria-hidden
                  />
                </div>
                <div className="space-y-1">
                  <p className="text-sm font-medium">
                    No numbers match your search/filters
                  </p>
                  <p className="text-xs text-muted-foreground max-w-xs">
                    Try a different search term or clear some filters to see more
                    numbers.
                  </p>
                </div>
              </CardContent>
            </Card>
          ) : (
            <div className="rounded-lg border border-border overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Phone number</TableHead>
                    <TableHead>Owner</TableHead>
                    <TableHead>Assistant</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {tb.filtered.map((num) => (
                    <TableRow key={num.id}>
                      <TableCell className="tabular text-sm text-foreground">
                        {num.phoneNumber}
                      </TableCell>
                      <TableCell>
                        <OwnerSelect num={num} users={users} />
                      </TableCell>
                      <TableCell>
                        <AssistantSelect num={num} assistants={assistants} />
                      </TableCell>
                      <TableCell className="text-right">
                        <DeleteNumberButton num={num} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
