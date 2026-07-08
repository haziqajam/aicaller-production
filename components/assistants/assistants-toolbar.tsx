"use client";

import * as React from "react";
import {
  SearchIcon,
  ListFilter,
  Check,
  X,
  ChevronDown,
} from "lucide-react";
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

export interface ToolbarFilters {
  /** facet key -> selected values */
  [key: string]: string[];
}

interface AssistantsToolbarProps {
  query: string;
  onQueryChange: (q: string) => void;
  facets: FacetConfig[];
  filters: ToolbarFilters;
  onToggle: (key: string, value: string) => void;
  onClearAll: () => void;
  total: number;
  shown: number;
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

export function AssistantsToolbar({
  query,
  onQueryChange,
  facets,
  filters,
  onToggle,
  onClearAll,
  total,
  shown,
}: AssistantsToolbarProps) {
  const activeCount = Object.values(filters).reduce(
    (n, vals) => n + vals.length,
    0
  );
  const hasActive = activeCount > 0 || query.trim().length > 0;

  // Active-filter pills (label them with the facet's human option label).
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
            placeholder="Search by name or prompt…"
            aria-label="Search assistants"
            className="h-8 pl-8"
          />
        </div>

        {/* Facet filters */}
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
            <>{total} assistant{total === 1 ? "" : "s"}</>
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
