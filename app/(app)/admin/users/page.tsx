"use client";

import * as React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Admin, type UserRecord } from "@/lib/api/admin";
import { toastApiError, parseApiError } from "@/lib/api/errors";
import { getRole } from "@/lib/auth";
import { StatusChip } from "@/components/status-chip";
import { DataTable } from "@/components/data-table";
import { DataToolbar, useDataToolbar } from "@/components/data-toolbar";
import type { ColumnDef } from "@tanstack/react-table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { ShieldIcon, UserPlusIcon } from "lucide-react";

// ---------- Role chip (muted, no custom color) ----------

function RoleChip({ role }: { role: "user" | "admin" }) {
  if (role === "admin") {
    return (
      <span className="inline-flex items-center rounded-full border border-primary/25 bg-primary/12 px-2 py-0.5 text-[11px] font-medium capitalize text-primary">
        Admin
      </span>
    );
  }
  return (
    <span className="inline-flex items-center rounded-full border border-border bg-muted px-2 py-0.5 text-[11px] font-medium capitalize text-muted-foreground">
      User
    </span>
  );
}

// ---------- Role select (inline) ----------

function RoleSelect({
  userId,
  currentRole,
}: {
  userId: string;
  currentRole: "user" | "admin";
}) {
  const qc = useQueryClient();
  const [saving, setSaving] = React.useState(false);

  async function handleChange(value: string | null) {
    const role = value as "user" | "admin" | null;
    if (!role || role === currentRole) return;
    setSaving(true);
    try {
      await Admin.setRole(userId, role);
      await qc.invalidateQueries({ queryKey: ["admin-users"] });
      toast.success(`Role updated to ${role}`);
    } catch (err) {
      toastApiError(err, "Couldn't update role");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Select value={currentRole} onValueChange={handleChange} disabled={saving}>
      <SelectTrigger
        className="w-28 transition-opacity duration-150"
        style={{ opacity: saving ? 0.6 : undefined }}
        size="sm"
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="user">User</SelectItem>
        <SelectItem value="admin">Admin</SelectItem>
      </SelectContent>
    </Select>
  );
}

// ---------- Reactivate button ----------

function ReactivateButton({ user }: { user: UserRecord }) {
  const qc = useQueryClient();
  const [loading, setLoading] = React.useState(false);

  async function handleReactivate() {
    setLoading(true);
    try {
      await Admin.reactivate(user.id);
      await qc.invalidateQueries({ queryKey: ["admin-users"] });
      toast.success(`${user.email} reactivated`);
    } catch (err) {
      toastApiError(err, "Couldn't reactivate user");
    } finally {
      setLoading(false);
    }
  }

  // Non-destructive, so no confirm dialog — a plain button (Base UI onClick).
  return (
    <Button
      variant="outline"
      size="sm"
      onClick={handleReactivate}
      disabled={loading}
    >
      {loading ? "Reactivating…" : "Reactivate"}
    </Button>
  );
}

// ---------- Deactivate alert-dialog ----------

function DeactivateButton({ user }: { user: UserRecord }) {
  const qc = useQueryClient();
  const [loading, setLoading] = React.useState(false);
  const [open, setOpen] = React.useState(false);

  async function handleDeactivate() {
    setLoading(true);
    try {
      await Admin.deactivate(user.id);
      // Close BEFORE the list refetch flips this row to the status chip below
      // and unmounts the dialog. If the dialog unmounted while still open,
      // Base UI would skip its close cleanup and leave the document
      // inert/pointer-events:none — killing every click, incl. the sidebar.
      setOpen(false);
      await qc.invalidateQueries({ queryKey: ["admin-users"] });
      toast.success(`${user.email} deactivated`);
    } catch (err) {
      toastApiError(err, "Couldn't deactivate user");
    } finally {
      setLoading(false);
    }
  }

  // Once deactivated, swap the Deactivate action for a Reactivate one — but
  // only after the dialog has finished closing (`!open`), never mid-close (the
  // Status column already shows the "stopped" chip).
  if (user.active === false && !open) {
    return <ReactivateButton user={user} />;
  }

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger render={<Button variant="destructive" size="sm" />}>
        Deactivate
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Deactivate user?</AlertDialogTitle>
          <AlertDialogDescription>
            This will revoke access for <strong>{user.email}</strong>. They will
            not be able to sign in until reactivated.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            onClick={handleDeactivate}
            disabled={loading}
          >
            {loading ? "Deactivating…" : "Deactivate"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

// ---------- Delete alert-dialog ----------

function DeleteButton({ user }: { user: UserRecord }) {
  const qc = useQueryClient();
  const [loading, setLoading] = React.useState(false);
  const [open, setOpen] = React.useState(false);

  async function handleDelete() {
    setLoading(true);
    try {
      await Admin.deleteUser(user.id);
      // Close BEFORE the list refetch removes this row and unmounts the dialog.
      // If the dialog unmounted while still open, Base UI would skip its close
      // cleanup and leave the document inert (pointer-events:none) — killing
      // every click, including the sidebar.
      setOpen(false);
      await qc.invalidateQueries({ queryKey: ["admin-users"] });
      toast.success(`${user.email} deleted`);
    } catch (err) {
      // Backend blocks an admin from deleting their own account — surface it.
      toastApiError(err, "Couldn't delete user");
    } finally {
      setLoading(false);
    }
  }

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger render={<Button variant="destructive" size="sm" />}>
        Delete
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete user?</AlertDialogTitle>
          <AlertDialogDescription>
            This permanently removes <strong>{user.email}</strong>&apos;s
            account. This action cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            onClick={handleDelete}
            disabled={loading}
          >
            {loading ? "Deleting…" : "Delete"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

// ---------- Create-user dialog ----------

function CreateUserDialog() {
  const qc = useQueryClient();
  const [open, setOpen] = React.useState(false);
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [role, setRole] = React.useState<"user" | "admin">("user");
  const [loading, setLoading] = React.useState(false);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      await Admin.createUser({ email, password, role });
      await qc.invalidateQueries({ queryKey: ["admin-users"] });
      toast.success(`Created ${email}`);
      setOpen(false);
      setEmail("");
      setPassword("");
      setRole("user");
    } catch (err) {
      toastApiError(err, "Couldn't create user");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button />}>
        <UserPlusIcon className="size-4" aria-hidden />
        Create user
      </DialogTrigger>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Create new user</DialogTitle>
          <DialogDescription>
            Create a new account. Share the credentials with the new user
            securely — they can change their password after signing in.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleCreate} className="space-y-3">
          <div className="space-y-1">
            <label className="text-xs font-medium text-foreground">Email</label>
            <Input
              type="email"
              placeholder="user@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="off"
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-foreground">
              Temporary password
            </label>
            <Input
              type="password"
              placeholder="Set a temporary password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={8}
              autoComplete="new-password"
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-foreground">Role</label>
            <Select
              value={role}
              onValueChange={(v) => v && setRole(v as "user" | "admin")}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="user">User</SelectItem>
                <SelectItem value="admin">Admin</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button type="submit" disabled={loading} className="w-full">
              {loading ? "Creating…" : "Create user"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ---------- Table columns ----------

function buildColumns(): ColumnDef<UserRecord, unknown>[] {
  return [
    {
      accessorKey: "email",
      header: "Email",
      cell: ({ row }) => (
        <span className="tabular text-sm font-mono text-foreground">
          {row.original.email}
        </span>
      ),
    },
    {
      accessorKey: "role",
      header: "Role",
      cell: ({ row }) => <RoleChip role={row.original.role} />,
    },
    {
      accessorKey: "created_at",
      header: "Joined",
      cell: ({ row }) => {
        const d = row.original.created_at;
        if (!d) return <span className="text-muted-foreground text-xs">—</span>;
        return (
          <span className="tabular text-xs text-muted-foreground">
            {new Date(d).toLocaleDateString("en-US", {
              year: "numeric",
              month: "short",
              day: "numeric",
            })}
          </span>
        );
      },
    },
    {
      id: "active",
      header: "Status",
      cell: ({ row }) => (
        <StatusChip status={row.original.active === false ? "stopped" : "active"} />
      ),
    },
    {
      id: "change-role",
      header: "Change role",
      cell: ({ row }) => (
        <RoleSelect userId={row.original.id} currentRole={row.original.role} />
      ),
    },
    {
      id: "actions",
      header: "",
      cell: ({ row }) => (
        <div className="flex items-center justify-end gap-2">
          <DeactivateButton user={row.original} />
          <DeleteButton user={row.original} />
        </div>
      ),
    },
  ];
}

// ---------- Table skeleton ----------

function UserTableSkeleton() {
  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <Skeleton className="h-7 w-48" />
        <Skeleton className="h-7 w-24" />
      </div>
      <div className="rounded-lg border border-border overflow-hidden">
        <div className="divide-y divide-border">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex items-center gap-4 px-3 py-2">
              <Skeleton className="h-4 w-48" />
              <Skeleton className="h-5 w-14 rounded-full" />
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-5 w-14 rounded-full" />
              <Skeleton className="h-7 w-28" />
              <Skeleton className="h-7 w-24" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ---------- Main page ----------

export default function AdminUsersPage() {
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
                Admin access is required to manage users. Contact your
                administrator to request elevated permissions.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return <AdminUsersContent />;
}

// Inner component — only rendered for admins, safe to call Admin.*
function AdminUsersContent() {
  const columns = React.useMemo(() => buildColumns(), []);

  const { data, isLoading, isError, error } = useQuery<UserRecord[]>({
    queryKey: ["admin-users"],
    queryFn: Admin.listUsers,
  });

  const users: UserRecord[] = data ?? [];
  const isEmpty = !isLoading && !isError && users.length === 0;

  const tb = useDataToolbar(users, {
    search: (u) => u.email,
    facets: [
      {
        key: "role",
        label: "Role",
        options: [
          { value: "user", label: "User" },
          { value: "admin", label: "Admin" },
        ],
        get: (u) => u.role,
      },
      {
        key: "status",
        label: "Status",
        options: [
          { value: "active", label: "Active" },
          { value: "suspended", label: "Suspended" },
        ],
        get: (u) => (u.active === false ? "suspended" : "active"),
      },
    ],
  });

  return (
    <div className="space-y-4">
      {/* ── Page header ──────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            Admin
          </p>
          <h1 className="mt-0.5 text-base font-semibold text-foreground">
            Users
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Manage who has access to this console and what they can do.
          </p>
        </div>
        <CreateUserDialog />
      </div>

      {/* ── Loading skeletons ─────────────────────────────────── */}
      {isLoading && <UserTableSkeleton />}

      {/* ── Error state ───────────────────────────────────────── */}
      {isError && (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            {parseApiError(error, "Couldn't load users.")}
          </CardContent>
        </Card>
      )}

      {/* ── Teaching empty state ──────────────────────────────── */}
      {isEmpty && (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-14 text-center">
            <div className="flex size-10 items-center justify-center rounded-lg bg-muted">
              <ShieldIcon className="size-5 text-muted-foreground" aria-hidden />
            </div>
            <div className="space-y-1">
              <p className="text-sm font-medium">No users yet</p>
              <p className="text-xs text-muted-foreground max-w-xs">
                Create an account for a colleague to give them access. Users can
                manage assistants and campaigns; admins can also manage other
                users.
              </p>
            </div>
            <CreateUserDialog />
          </CardContent>
        </Card>
      )}

      {/* ── Users toolbar + data-table ────────────────────────── */}
      {!isLoading && !isError && users.length > 0 && (
        <div className="space-y-3">
          <DataToolbar
            {...tb.toolbarProps}
            noun="user"
            searchPlaceholder="Search by email…"
          />
          <DataTable<UserRecord, unknown>
            columns={columns}
            data={tb.filtered}
            getRowId={(row) => row.id}
            emptyState="No users match the current filters."
            totalCount={tb.filtered.length}
          />
        </div>
      )}
    </div>
  );
}
