"use client";

import * as React from "react";
import Link from "next/link";
import {
  useQuery,
  useQueryClient,
  useMutation,
  keepPreviousData,
} from "@tanstack/react-query";
import { toast } from "sonner";
import { Leads, LeadLists, type Paginated } from "@/lib/api/resources";
import type { Lead, LeadList } from "@/lib/api/schemas";
import { toastApiError } from "@/lib/api/errors";
import { DataTable } from "@/components/data-table";
import { DataToolbar } from "@/components/data-toolbar";
import { leadsColumns } from "@/components/leads/columns";
import { ImportDialog } from "@/components/leads/import-dialog";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { useUrlPagination } from "@/lib/use-url-pagination";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { ArrowLeftIcon, ListChecksIcon, Trash2Icon, MinusCircleIcon } from "lucide-react";

const STATUS_OPTIONS = [
  { value: "pending", label: "Pending" }, { value: "called", label: "Called" },
  { value: "failed", label: "Failed" }, { value: "skipped", label: "Skipped" },
];
const SOURCE_OPTIONS = [
  { value: "csv", label: "CSV" }, { value: "manual", label: "Manual" }, { value: "api", label: "API" },
];

const FACETS = [
  { key: "status", label: "Status", options: STATUS_OPTIONS },
  { key: "source", label: "Source", options: SOURCE_OPTIONS },
];

export default function LeadListDetailPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <React.Suspense fallback={<Skeleton className="h-64 rounded-lg" />}>
      <LeadListDetail params={params} />
    </React.Suspense>
  );
}

function LeadListDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = React.use(params);
  const qc = useQueryClient();
  const [selectedIds, setSelectedIds] = React.useState<string[]>([]);
  const [deleteOpen, setDeleteOpen] = React.useState(false);
  const [tableKey, setTableKey] = React.useState(0);

  // page/size live in the URL (?page=&size=); we drive the SERVER fetch from
  // them rather than slicing a client array.
  const { page, pageSize, setPage, setPageSize } = useUrlPagination({ defaultSize: 20 });

  // Search + facet UI state. Search is debounced into the `q` param; facets are
  // single-select (the server params accept one value each). We render the
  // existing multi-select DataToolbar but only ever keep ONE value per facet.
  const [searchInput, setSearchInput] = React.useState("");
  const [debouncedQ, setDebouncedQ] = React.useState("");
  const [filters, setFilters] = React.useState<Record<string, string[]>>({});
  const status = filters.status?.[0];
  const source = filters.source?.[0];

  // Debounce the search box (~300ms) into the query param.
  React.useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(searchInput.trim()), 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  // Reset to page 1 whenever the query/facets change.
  const filterKey = `${debouncedQ}|${status ?? ""}|${source ?? ""}`;
  const lastFilterKey = React.useRef(filterKey);
  React.useEffect(() => {
    if (lastFilterKey.current !== filterKey) {
      lastFilterKey.current = filterKey;
      setPage(1);
    }
  }, [filterKey, setPage]);

  const { data: list } = useQuery<LeadList>({
    queryKey: ["lead-list", id],
    queryFn: () => LeadLists.get(id),
  });

  const { data: pageData, isLoading, isFetching } = useQuery<Paginated<Lead>>({
    queryKey: ["lead-lists", id, "leads", { page, pageSize, q: debouncedQ, status, source }],
    queryFn: () =>
      LeadLists.listLeads(id, {
        skip: (page - 1) * pageSize,
        limit: pageSize,
        q: debouncedQ || undefined,
        status,
        source,
      }),
    placeholderData: keepPreviousData,
  });

  const items = pageData?.items ?? [];
  const total = pageData?.total ?? 0;
  const hasFilters = Boolean(debouncedQ || status || source);

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["lead-lists", id, "leads"] });
    qc.invalidateQueries({ queryKey: ["lead-list", id] });
  };
  const clearSelection = () => { setSelectedIds([]); setTableKey((k) => k + 1); };

  const onToggleFacet = React.useCallback((key: string, value: string) => {
    setFilters((prev) => {
      const isOn = prev[key]?.[0] === value;
      return { ...prev, [key]: isOn ? [] : [value] }; // single-select
    });
  }, []);
  const onClearAll = React.useCallback(() => {
    setSearchInput("");
    setDebouncedQ("");
    setFilters({});
  }, []);

  const removeFromList = useMutation({
    mutationFn: (ids: string[]) => LeadLists.removeLeads(id, ids),
    onSuccess: () => { toast.success("Removed from list"); clearSelection(); refresh(); },
    onError: (e) => toastApiError(e),
  });
  const deleteLeads = useMutation({
    mutationFn: (ids: string[]) => Leads.removeMany(ids),
    onSuccess: (res) => {
      toast.success(`Deleted ${res?.deleted ?? selectedIds.length} lead(s)`);
      setDeleteOpen(false); clearSelection(); refresh();
    },
    onError: (e) => toastApiError(e),
  });

  const showEmpty = !isLoading && total === 0 && !hasFilters;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="min-w-0">
          <Link href="/leads" className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
            <ArrowLeftIcon className="size-3.5" />Lead lists
          </Link>
          <h1 className="mt-1 flex items-center gap-2 text-base font-semibold text-foreground">
            <ListChecksIcon className="size-4 text-primary" />
            {list?.name ?? "List"}
            <span className="text-xs font-normal text-muted-foreground">({total})</span>
          </h1>
        </div>
        <div className="flex items-center gap-2">
          {selectedIds.length > 0 && (
            <>
              <span className="text-xs text-muted-foreground">{selectedIds.length} selected</span>
              <Button variant="outline" size="sm" onClick={() => removeFromList.mutate(selectedIds)}>
                <MinusCircleIcon className="size-4" />Remove from list
              </Button>
              <Button variant="destructive" size="sm" onClick={() => setDeleteOpen(true)}>
                <Trash2Icon className="size-4" />Delete
              </Button>
            </>
          )}
          <ImportDialog onImported={refresh} listId={id} />
        </div>
      </div>

      {isLoading ? (
        <Skeleton className="h-64 rounded-lg" />
      ) : showEmpty ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-14 text-center">
            <div className="flex size-10 items-center justify-center rounded-lg bg-muted">
              <ListChecksIcon className="size-5 text-muted-foreground" />
            </div>
            <div className="space-y-1">
              <p className="text-sm font-medium">No contacts in this list</p>
              <p className="text-xs text-muted-foreground max-w-xs">Import a CSV to add contacts to this list.</p>
            </div>
            <ImportDialog onImported={refresh} listId={id} />
          </CardContent>
        </Card>
      ) : (
        <div className={`space-y-3 ${isFetching ? "opacity-70 transition-opacity" : ""}`}>
          <DataToolbar
            query={searchInput}
            onQueryChange={setSearchInput}
            facets={FACETS}
            filters={filters}
            onToggle={onToggleFacet}
            onClearAll={onClearAll}
            total={total}
            shown={items.length}
            noun="lead"
            searchPlaceholder="Search by name or phone…"
          />
          <DataTable<Lead, unknown>
            key={tableKey}
            columns={leadsColumns}
            data={items}
            manualPagination
            page={page}
            pageSize={pageSize}
            rowCount={total}
            onPageChange={setPage}
            onPageSizeChange={setPageSize}
            getRowId={(row) => row.id ?? row.phone ?? Math.random().toString()}
            onSelectionChange={(ids) => setSelectedIds(ids)}
            emptyState="No leads match your filters."
            toolbar={null}
          />
        </div>
      )}

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {selectedIds.length} lead(s)?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently removes the contacts from the database (and every list). This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction variant="destructive"
              onClick={() => deleteLeads.mutate(selectedIds)}
              disabled={deleteLeads.isPending || selectedIds.length === 0}>
              {deleteLeads.isPending ? "Deleting…" : `Delete ${selectedIds.length}`}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
