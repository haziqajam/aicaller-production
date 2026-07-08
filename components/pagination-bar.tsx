"use client";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";

interface PaginationBarProps {
  /** Current page (1-based). */
  page: number;
  /** Total number of pages (>= 1). */
  pageCount: number;
  /** Total items across all pages. */
  total: number;
  /** Items per page. */
  pageSize: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
  /** Page-size choices offered in the dropdown. */
  pageSizeOptions?: number[];
  /** Noun for the count summary, e.g. "leads", "numbers". */
  itemLabel?: string;
  className?: string;
}

/**
 * Shared pagination control: "X–Y of N" summary + page-size selector +
 * Prev/Next. Presentational only — wire it to URL state via useUrlPagination.
 */
export function PaginationBar({
  page,
  pageCount,
  total,
  pageSize,
  onPageChange,
  onPageSizeChange,
  pageSizeOptions = [10, 20, 50, 100],
  itemLabel = "items",
  className,
}: PaginationBarProps) {
  if (total === 0) return null;

  const start = (page - 1) * pageSize + 1;
  const end = Math.min(total, page * pageSize);
  const canPrev = page > 1;
  const canNext = page < pageCount;
  // Always include the active size so the selector never renders blank.
  const sizeOptions = Array.from(
    new Set([...pageSizeOptions, pageSize])
  ).sort((a, b) => a - b);

  return (
    <div
      className={cn(
        "flex flex-wrap items-center justify-between gap-3 px-1 text-xs text-muted-foreground",
        className
      )}
    >
      <span className="tabular-nums">
        <span className="font-medium text-foreground/80">
          {start}–{end}
        </span>{" "}
        of <span className="font-medium text-foreground/80">{total}</span>{" "}
        {itemLabel}
      </span>

      <div className="flex items-center gap-3">
        <div className="flex items-center gap-1.5">
          <span className="hidden sm:inline">Rows per page</span>
          <Select
            value={String(pageSize)}
            onValueChange={(v) => onPageSizeChange(Number(v))}
          >
            <SelectTrigger size="sm" className="h-7 w-[4.5rem]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {sizeOptions.map((opt) => (
                <SelectItem key={opt} value={String(opt)}>
                  {opt}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <span className="tabular-nums">
          Page {page} of {pageCount}
        </span>

        <div className="flex items-center gap-1">
          <Button
            variant="outline"
            size="icon-sm"
            aria-label="Previous page"
            onClick={() => onPageChange(page - 1)}
            disabled={!canPrev}
          >
            <ChevronLeftIcon className="size-4" />
          </Button>
          <Button
            variant="outline"
            size="icon-sm"
            aria-label="Next page"
            onClick={() => onPageChange(page + 1)}
            disabled={!canNext}
          >
            <ChevronRightIcon className="size-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
