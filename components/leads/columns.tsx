"use client";

import { type ColumnDef } from "@tanstack/react-table";
import { Checkbox } from "@/components/ui/checkbox";
import { StatusChip } from "@/components/status-chip";
import { LeadVarsButton } from "@/components/leads/lead-vars-dialog";

export type Lead = {
  id?: string;
  name?: string;
  phone?: string;
  status?: string;
  source?: string;
  created_at?: string;
  vars?: Record<string, unknown>;
};

export const leadsColumns: ColumnDef<Lead>[] = [
  {
    id: "select",
    header: ({ table }) => (
      <Checkbox
        checked={table.getIsAllPageRowsSelected()}
        indeterminate={table.getIsSomePageRowsSelected() && !table.getIsAllPageRowsSelected()}
        onCheckedChange={(checked) =>
          table.toggleAllPageRowsSelected(!!checked)
        }
        aria-label="Select all on page"
      />
    ),
    cell: ({ row }) => (
      <Checkbox
        checked={row.getIsSelected()}
        onCheckedChange={(checked) => row.toggleSelected(!!checked)}
        aria-label="Select row"
      />
    ),
    enableSorting: false,
    enableHiding: false,
    size: 32,
  },
  {
    accessorKey: "name",
    header: "Name",
    cell: ({ getValue }) => (
      <span className="font-medium text-foreground">
        {(getValue() as string) || "—"}
      </span>
    ),
  },
  {
    accessorKey: "phone",
    header: "Phone",
    cell: ({ getValue }) => (
      <span className="tabular text-sm text-foreground">
        {(getValue() as string) || "—"}
      </span>
    ),
  },
  {
    accessorKey: "status",
    header: "Status",
    cell: ({ getValue }) => {
      const status = (getValue() as string) || "pending";
      return <StatusChip status={status} />;
    },
    filterFn: (row, columnId, filterValue) => {
      if (!filterValue) return true;
      return (row.getValue(columnId) as string)?.toLowerCase() === filterValue.toLowerCase();
    },
  },
  {
    accessorKey: "source",
    header: "Source",
    cell: ({ getValue }) => {
      const source = getValue() as string | undefined;
      if (!source) return <span className="text-muted-foreground text-xs">—</span>;
      return (
        <span className="inline-flex items-center rounded-full border border-border bg-muted px-2 py-0.5 text-[11px] font-medium capitalize text-muted-foreground">
          {source}
        </span>
      );
    },
    filterFn: (row, columnId, filterValue) => {
      if (!filterValue) return true;
      return (row.getValue(columnId) as string)?.toLowerCase() === filterValue.toLowerCase();
    },
  },
  {
    accessorKey: "created_at",
    header: "Added",
    cell: ({ getValue }) => {
      const v = getValue() as string | undefined;
      if (!v) return <span className="text-muted-foreground text-xs">—</span>;
      try {
        return (
          <span className="tabular text-xs text-muted-foreground">
            {new Date(v).toLocaleDateString()}
          </span>
        );
      } catch {
        return <span className="text-muted-foreground text-xs">—</span>;
      }
    },
  },
  {
    id: "actions",
    header: () => <span className="sr-only">Actions</span>,
    cell: ({ row }) => (
      <div className="flex justify-end">
        <LeadVarsButton lead={row.original} />
      </div>
    ),
    enableSorting: false,
    enableHiding: false,
    size: 40,
  },
];
