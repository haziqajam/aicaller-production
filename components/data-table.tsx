"use client";

import * as React from "react";
import {
  type ColumnDef,
  type ColumnFiltersState,
  type SortingState,
  type VisibilityState,
  type RowSelectionState,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
} from "@tanstack/react-table";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { PaginationBar } from "@/components/pagination-bar";
import { useUrlPagination } from "@/lib/use-url-pagination";

interface DataTableProps<TData, TValue> {
  columns: ColumnDef<TData, TValue>[];
  data: TData[];
  /** Searchable column id */
  searchColumn?: string;
  searchPlaceholder?: string;
  /** Faceted filter options: { columnId, label, options: [{value, label}] }[] */
  facets?: FacetConfig[];
  /** Total count across ALL pages/filters (not just visible page) */
  totalCount?: number;
  /** Toolbar slot rendered after filters */
  toolbar?: React.ReactNode;
  /** Called with selected row indices + "select all matching" state */
  onSelectionChange?: (selectedIds: string[], selectAllMatching: boolean) => void;
  /** Row id accessor */
  getRowId?: (row: TData) => string;
  /** Empty state node */
  emptyState?: React.ReactNode;
  /** Called when a row is clicked */
  onRowClick?: (row: TData) => void;

  // ── Manual / server-side pagination mode ──────────────────────────────────
  // When `manualPagination` is true the table treats `data` as the already-
  // fetched current page: it does NOT slice, filter or sort client-side.
  // Paging/filtering is owned by the parent (which refetches from the server).
  /** Enable server-driven paging + filtering. */
  manualPagination?: boolean;
  /** Current page (1-based) — required in manual mode. */
  page?: number;
  /** Page size — required in manual mode. */
  pageSize?: number;
  /** Total rows across the WHOLE result set (server `total`). */
  rowCount?: number;
  /** Page-change handler (1-based) — required in manual mode. */
  onPageChange?: (page: number) => void;
  /** Page-size-change handler — required in manual mode. */
  onPageSizeChange?: (size: number) => void;
}

export interface FacetConfig {
  columnId: string;
  label: string;
  options: { value: string; label: string }[];
}

/**
 * Public wrapper. The inner table reads page/size from the URL (nuqs →
 * useSearchParams), which Next.js requires to sit under a Suspense boundary
 * during static generation. Wrapping here means consumers don't need their own.
 */
export function DataTable<TData, TValue>(props: DataTableProps<TData, TValue>) {
  return (
    <React.Suspense fallback={<div className="h-40 rounded-md border" />}>
      <DataTableInner {...props} />
    </React.Suspense>
  );
}

function DataTableInner<TData, TValue>({
  columns,
  data,
  searchColumn,
  searchPlaceholder = "Search…",
  facets,
  totalCount,
  toolbar,
  onSelectionChange,
  getRowId,
  emptyState,
  onRowClick,
  manualPagination = false,
  page: controlledPage,
  pageSize: controlledPageSize,
  rowCount,
  onPageChange,
  onPageSizeChange,
}: DataTableProps<TData, TValue>) {
  const [sorting, setSorting] = React.useState<SortingState>([]);
  const [columnFilters, setColumnFilters] = React.useState<ColumnFiltersState>([]);
  const [columnVisibility, setColumnVisibility] = React.useState<VisibilityState>({});
  const [rowSelection, setRowSelection] = React.useState<RowSelectionState>({});
  const [selectAllMatching, setSelectAllMatching] = React.useState(false);

  // Client-side page state persists in the URL (?page=2&size=20). In manual
  // mode the PARENT owns page/size (it drives the server fetch), so we use the
  // controlled props instead and never touch the URL hook's setters.
  const urlPagination = useUrlPagination({ defaultSize: 20 });
  const page = manualPagination ? controlledPage ?? 1 : urlPagination.page;
  const pageSize = manualPagination
    ? controlledPageSize ?? 20
    : urlPagination.pageSize;
  const urlSetPage = urlPagination.setPage;
  const urlSetPageSize = urlPagination.setPageSize;
  const setPage = React.useCallback(
    (p: number) => (manualPagination ? onPageChange?.(p) : urlSetPage(p)),
    [manualPagination, onPageChange, urlSetPage]
  );
  const setPageSize = React.useCallback(
    (s: number) => (manualPagination ? onPageSizeChange?.(s) : urlSetPageSize(s)),
    [manualPagination, onPageSizeChange, urlSetPageSize]
  );

  const pagination = React.useMemo(
    () => ({ pageIndex: Math.max(0, page - 1), pageSize }),
    [page, pageSize]
  );

  const table = useReactTable({
    data,
    columns,
    state: { sorting, columnFilters, columnVisibility, rowSelection, pagination },
    onSortingChange: setSorting,
    onColumnFiltersChange: (updater) => {
      setColumnFilters(updater);
      // Reset "select all matching" + jump to the first page when filters change
      setSelectAllMatching(false);
      setRowSelection({});
      setPage(1);
    },
    onColumnVisibilityChange: setColumnVisibility,
    onRowSelectionChange: (updater) => {
      setRowSelection(updater);
      setSelectAllMatching(false);
    },
    onPaginationChange: (updater) => {
      const next =
        typeof updater === "function" ? updater(pagination) : updater;
      if (next.pageSize !== pageSize) setPageSize(next.pageSize);
      else setPage(next.pageIndex + 1);
    },
    // Manual mode: the server already returned exactly this page (and already
    // applied search/facets), so disable client paging + filtering and hand the
    // table the authoritative page count.
    manualPagination,
    manualFiltering: manualPagination,
    ...(manualPagination
      ? { pageCount: Math.max(1, Math.ceil((rowCount ?? 0) / pageSize)) }
      : {}),
    getCoreRowModel: getCoreRowModel(),
    ...(manualPagination ? {} : { getFilteredRowModel: getFilteredRowModel() }),
    ...(manualPagination ? {} : { getPaginationRowModel: getPaginationRowModel() }),
    getSortedRowModel: getSortedRowModel(),
    getRowId,
  });

  const pageCount = table.getPageCount();
  // Clamp out-of-range pages (e.g. after filtering/deleting reduces the rows).
  // Skip in manual mode: the parent owns paging and resets to page 1 on
  // filter/search changes, and clamping here would fight the server round-trip.
  React.useEffect(() => {
    if (manualPagination) return;
    if (pageCount >= 1 && page > pageCount) setPage(pageCount);
  }, [manualPagination, page, pageCount, setPage]);

  // Notify parent of selection changes.
  //
  // Consumers typically pass `onSelectionChange` as an inline function, so its
  // identity changes on every render. Depending on it here would create an
  // infinite loop: effect fires → parent setState (new array) → parent
  // re-renders → new callback identity → effect dep changed → effect fires …
  // ("Maximum update depth exceeded"). To break it we (1) keep the latest
  // callback in a ref so the effect never depends on its identity, and (2) emit
  // only when the selection CONTENT actually changes, tracked via a stable key.
  const onSelectionChangeRef = React.useRef(onSelectionChange);
  onSelectionChangeRef.current = onSelectionChange;
  const lastEmittedKeyRef = React.useRef<string | null>(null);

  React.useEffect(() => {
    const cb = onSelectionChangeRef.current;
    if (!cb) return;
    const selectedIds = Object.keys(rowSelection).filter((k) => rowSelection[k]);
    const key = `${selectAllMatching}|${[...selectedIds].sort().join(",")}`;
    if (key === lastEmittedKeyRef.current) return;
    lastEmittedKeyRef.current = key;
    cb(selectedIds, selectAllMatching);
  }, [rowSelection, selectAllMatching]);

  // In manual mode the "filtered" count is the server total; client mode reads
  // it from the filtered row model.
  const filteredCount = manualPagination
    ? rowCount ?? data.length
    : table.getFilteredRowModel().rows.length;
  const selectedCount = selectAllMatching
    ? (totalCount ?? filteredCount)
    : Object.values(rowSelection).filter(Boolean).length;
  const pageSelectedCount = table.getSelectedRowModel().rows.length;
  const hasAnySelection = pageSelectedCount > 0 || selectAllMatching;

  function handleFacetChange(columnId: string, value: string | null) {
    if (value === null || value === "") {
      table.getColumn(columnId)?.setFilterValue(undefined);
    } else {
      table.getColumn(columnId)?.setFilterValue(value);
    }
    setSelectAllMatching(false);
    setRowSelection({});
  }

  return (
    <div className="space-y-2">
      {/* Toolbar: search + faceted filters + custom toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        {searchColumn && (
          <Input
            placeholder={searchPlaceholder}
            value={(table.getColumn(searchColumn)?.getFilterValue() as string) ?? ""}
            onChange={(e) =>
              table.getColumn(searchColumn)?.setFilterValue(e.target.value)
            }
            className="h-7 w-48 text-sm"
          />
        )}
        {facets?.map((facet) => (
          <FacetFilter
            key={facet.columnId}
            facet={facet}
            value={(table.getColumn(facet.columnId)?.getFilterValue() as string) ?? ""}
            onChange={(v) => handleFacetChange(facet.columnId, v)}
          />
        ))}
        {/* Active filter badges */}
        {columnFilters.length > 0 && (
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-xs text-muted-foreground"
            onClick={() => {
              table.resetColumnFilters();
              setSelectAllMatching(false);
              setRowSelection({});
            }}
          >
            Clear filters
          </Button>
        )}
        <div className="ml-auto flex items-center gap-2">{toolbar}</div>
      </div>

      {/* Select-all-matching banner */}
      {pageSelectedCount > 0 && !selectAllMatching && filteredCount > pageSelectedCount && (
        <div className="flex items-center gap-2 rounded-md border border-primary/20 bg-primary/5 px-3 py-1.5 text-sm">
          <span className="text-muted-foreground">
            {pageSelectedCount} row{pageSelectedCount !== 1 ? "s" : ""} on this page selected.
          </span>
          <Button
            variant="link"
            size="sm"
            className="h-auto p-0 text-sm"
            onClick={() => setSelectAllMatching(true)}
          >
            Select all {totalCount ?? filteredCount} matching
          </Button>
        </div>
      )}
      {selectAllMatching && (
        <div className="flex items-center gap-2 rounded-md border border-primary/20 bg-primary/5 px-3 py-1.5 text-sm">
          <span className="text-muted-foreground">
            All {totalCount ?? filteredCount} matching rows selected.
          </span>
          <Button
            variant="link"
            size="sm"
            className="h-auto p-0 text-sm"
            onClick={() => {
              setSelectAllMatching(false);
              setRowSelection({});
            }}
          >
            Clear selection
          </Button>
        </div>
      )}

      {/* Bulk action hint */}
      {hasAnySelection && (
        <div className="text-xs text-muted-foreground">
          {selectedCount} selected
        </div>
      )}

      {/* Table */}
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <TableHead key={header.id} className="text-xs">
                    {header.isPlaceholder
                      ? null
                      : flexRender(header.column.columnDef.header, header.getContext())}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows.length ? (
              table.getRowModel().rows.map((row) => (
                <TableRow
                  key={row.id}
                  data-state={row.getIsSelected() ? "selected" : undefined}
                  className={`text-sm${onRowClick ? " cursor-pointer" : ""}`}
                  onClick={onRowClick ? () => onRowClick(row.original) : undefined}
                >
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id} className="py-1.5">
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell
                  colSpan={columns.length}
                  className="h-32 text-center text-sm text-muted-foreground"
                >
                  {emptyState ?? "No results."}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination (URL-synced via nuqs) */}
      <PaginationBar
        page={table.getState().pagination.pageIndex + 1}
        pageCount={pageCount}
        total={filteredCount}
        pageSize={pageSize}
        onPageChange={setPage}
        onPageSizeChange={setPageSize}
        itemLabel={columnFilters.length > 0 ? "filtered rows" : "rows"}
      />
    </div>
  );
}

/** Inline faceted filter as a row of badge-style buttons */
function FacetFilter({
  facet,
  value,
  onChange,
}: {
  facet: FacetConfig;
  value: string;
  onChange: (v: string | null) => void;
}) {
  return (
    <div className="flex items-center gap-1">
      <span className="text-xs text-muted-foreground">{facet.label}:</span>
      <button
        className={`rounded px-2 py-0.5 text-xs border transition-colors ${
          !value
            ? "border-primary bg-primary text-primary-foreground"
            : "border-border bg-background hover:bg-muted"
        }`}
        onClick={() => onChange(null)}
      >
        All
      </button>
      {facet.options.map((opt) => (
        <button
          key={opt.value}
          className={`rounded px-2 py-0.5 text-xs border transition-colors ${
            value === opt.value
              ? "border-primary bg-primary text-primary-foreground"
              : "border-border bg-background hover:bg-muted"
          }`}
          onClick={() => onChange(opt.value)}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}
