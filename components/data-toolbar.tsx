"use client";

/**
 * Reusable search + faceted-filter toolbar (the same design used on the
 * Assistants page). Drop it on any list page for a consistent experience.
 *
 * Two pieces:
 *  - `useDataToolbar(items, { search, facets })` — owns the query + selected
 *    filters state and returns the client-side `filtered` list plus the props
 *    to spread into <DataToolbar/>.
 *  - `<DataToolbar />` — the presentational bar (search input, facet popovers,
 *    active-filter pills, clear-all, result count).
 *
 * Example:
 *   const tb = useDataToolbar(leads, {
 *     search: (l) => `${l.name} ${l.phone}`,
 *     facets: [
 *       { key: "status", label: "Status",
 *         options: [{ value: "pending", label: "Pending" }, ...],
 *         get: (l) => l.status },
 *     ],
 *   });
 *   <DataToolbar {...tb.toolbarProps} noun="lead" searchPlaceholder="Search leads…" />
 *   // render tb.filtered (e.g. paginate(tb.filtered) or <DataTable data={tb.filtered} />)
 */

import * as React from "react";
import { SearchIcon, ListFilter, Check, X, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

export interface FacetOption {
  value: string;
  label: string;
}

export interface FacetConfig {
  key: string;
  label: string;
  options: FacetOption[];
}

/** facet key -> selected values */
export interface ToolbarFilters {
  [key: string]: string[];
}

/** A facet plus an accessor returning the item's value(s) for that facet. */
export interface FacetDef<T> extends FacetConfig {
  get: (item: T) => string | string[] | null | undefined;
}

// ───────────────────────────────────────────────────────────────────────────
// Hook: state + client-side filtering
// ───────────────────────────────────────────────────────────────────────────

export function useDataToolbar<T>(
  items: T[],
  config: {
    /** Text to match the search query against (case-insensitive substring). */
    search?: (item: T) => string;
    /** Faceted filters with value accessors. */
    facets: FacetDef<T>[];
  }
) {
  const [query, setQuery] = React.useState("");
  const [filters, setFilters] = React.useState<ToolbarFilters>({});

  const toggle = React.useCallback((key: string, value: string) => {
    setFilters((prev) => {
      const cur = prev[key] ?? [];
      const next = cur.includes(value)
        ? cur.filter((v) => v !== value)
        : [...cur, value];
      return { ...prev, [key]: next };
    });
  }, []);

  const clearAll = React.useCallback(() => {
    setQuery("");
    setFilters({});
  }, []);

  // Keep the latest config without forcing it into the memo deps (callers
  // usually pass inline accessors/facets that change identity every render).
  const cfgRef = React.useRef(config);
  cfgRef.current = config;

  const filtered = React.useMemo(() => {
    const { facets, search } = cfgRef.current;
    const q = query.trim().toLowerCase();
    return items.filter((item) => {
      if (q && search && !search(item).toLowerCase().includes(q)) return false;
      for (const facet of facets) {
        const selected = filters[facet.key];
        if (!selected || selected.length === 0) continue; // facet inactive
        const raw = facet.get(item);
        const vals =
          raw == null ? [] : Array.isArray(raw) ? raw : [String(raw)];
        // OR within a facet: the item matches if any of its values is selected.
        if (!vals.some((v) => selected.includes(v))) return false;
      }
      return true;
    });
  }, [items, query, filters]);

  // FacetConfig (without the accessor) for the presentational component.
  const facetConfigs: FacetConfig[] = config.facets.map(
    ({ key, label, options }) => ({ key, label, options })
  );

  return {
    query,
    setQuery,
    filters,
    toggle,
    clearAll,
    filtered,
    total: items.length,
    shown: filtered.length,
    /** Spread straight into <DataToolbar {...toolbarProps} noun="…" />. */
    toolbarProps: {
      query,
      onQueryChange: setQuery,
      facets: facetConfigs,
      filters,
      onToggle: toggle,
      onClearAll: clearAll,
      total: items.length,
      shown: filtered.length,
    },
  };
}

// ───────────────────────────────────────────────────────────────────────────
// Presentational toolbar
// ───────────────────────────────────────────────────────────────────────────

interface DataToolbarProps {
  query: string;
  onQueryChange: (q: string) => void;
  searchPlaceholder?: string;
  facets: FacetConfig[];
  filters: ToolbarFilters;
  onToggle: (key: string, value: string) => void;
  onClearAll: () => void;
  total: number;
  shown: number;
  /** Singular noun for the count label, e.g. "lead". */
  noun?: string;
  /** Plural override; defaults to `${noun}s`. */
  nounPlural?: string;
}

function FacetPopover({
  facet,
  selected,
  onToggle,
}: {
  facet: FacetConfig;
  selected: string[];
  onToggle: (value: string) => void;
}) {
  const count = selected.length;
  return (
    <Popover>
      <PopoverTrigger
        render={
          <Button
            variant="outline"
            size="sm"
            className={cn(
              "gap-1.5 border-dashed",
              count > 0 && "border-solid border-primary/40 bg-primary/5"
            )}
          />
        }
      >
        <ListFilter className="size-3.5" aria-hidden />
        {facet.label}
        {count > 0 && (
          <span className="tabular ml-0.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold text-primary-foreground">
            {count}
          </span>
        )}
        <ChevronDown className="size-3 opacity-60" aria-hidden />
      </PopoverTrigger>
      <PopoverContent align="start" className="w-52 gap-0.5 p-1.5">
        <p className="px-1.5 pb-1 pt-0.5 text-[9px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
          {facet.label}
        </p>
        {facet.options.map((opt) => {
          const active = selected.includes(opt.value);
          return (
            <button
              key={opt.value}
              type="button"
              role="checkbox"
              aria-checked={active}
              onClick={() => onToggle(opt.value)}
              className={cn(
                "flex w-full items-center gap-2 rounded-md px-1.5 py-1.5 text-left text-xs transition-colors",
                "hover:bg-accent focus:bg-accent focus:outline-none",
                active ? "text-foreground" : "text-muted-foreground"
              )}
            >
              <span
                className={cn(
                  "flex size-4 shrink-0 items-center justify-center rounded-[4px] border transition-colors",
                  active
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border"
                )}
              >
                {active && <Check className="size-3" aria-hidden />}
              </span>
              <span className="truncate">{opt.label}</span>
            </button>
          );
        })}
      </PopoverContent>
    </Popover>
  );
}

export function DataToolbar({
  query,
  onQueryChange,
  searchPlaceholder = "Search…",
  facets,
  filters,
  onToggle,
  onClearAll,
  total,
  shown,
  noun = "result",
  nounPlural,
}: DataToolbarProps) {
  const plural = nounPlural ?? `${noun}s`;
  const activeCount = Object.values(filters).reduce(
    (n, vals) => n + vals.length,
    0
  );
  const hasActive = activeCount > 0 || query.trim().length > 0;

  const pills: { key: string; value: string; label: string }[] = [];
  for (const facet of facets) {
    for (const value of filters[facet.key] ?? []) {
      const opt = facet.options.find((o) => o.value === value);
      pills.push({ key: facet.key, value, label: opt?.label ?? value });
    }
  }

  return (
    <div className="space-y-2.5">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        {/* Search */}
        <div className="relative flex-1">
          <SearchIcon
            className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <Input
            type="search"
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            placeholder={searchPlaceholder}
            aria-label={searchPlaceholder}
            className="h-8 pl-8"
          />
        </div>

        {/* Facet filters */}
        {facets.length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            {facets.map((facet) => (
              <FacetPopover
                key={facet.key}
                facet={facet}
                selected={filters[facet.key] ?? []}
                onToggle={(value) => onToggle(facet.key, value)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Active-filter pills + result count + clear all */}
      <div className="flex min-h-5 flex-wrap items-center gap-1.5">
        {pills.map((pill) => (
          <button
            key={`${pill.key}:${pill.value}`}
            type="button"
            onClick={() => onToggle(pill.key, pill.value)}
            className="group/pill inline-flex items-center gap-1 rounded-md border border-primary/30 bg-primary/8 px-1.5 py-0.5 text-[10px] font-medium text-foreground transition-colors hover:border-destructive/40 hover:bg-destructive/10"
            aria-label={`Remove filter ${pill.label}`}
          >
            {pill.label}
            <X className="size-2.5 text-muted-foreground group-hover/pill:text-destructive" aria-hidden />
          </button>
        ))}

        {hasActive && (
          <button
            type="button"
            onClick={onClearAll}
            className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground transition-colors hover:text-foreground focus:outline-none focus-visible:underline"
          >
            <X className="size-2.5" aria-hidden />
            Clear all
          </button>
        )}

        <span className="tabular ml-auto text-[10px] text-muted-foreground">
          {shown === total ? (
            <>
              {total} {total === 1 ? noun : plural}
            </>
          ) : (
            <>
              {shown} of {total}
            </>
          )}
        </span>
      </div>
    </div>
  );
}
