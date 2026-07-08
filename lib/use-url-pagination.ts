"use client";

/**
 * URL-synced pagination — page & page size live in the route query string
 * (e.g. ?page=2&size=20) so pagination is shareable, bookmarkable, and survives
 * refresh / back-forward. Backed by nuqs (useSearchParams under the hood), so
 * any component using this must have a <Suspense> ancestor (Next.js requirement
 * for useSearchParams during static generation).
 *
 * This is CLIENT-side paging: the full list is already in memory and `paginate`
 * slices the current page. Suitable for admin-scale datasets.
 */
import { useQueryState, parseAsInteger } from "nuqs";

export interface PaginatedSlice<T> {
  /** The items for the current page. */
  items: T[];
  /** Total items across all pages. */
  total: number;
  /** Number of pages (>= 1). */
  pageCount: number;
  /** Current page, clamped to [1, pageCount]. */
  page: number;
  /** 1-based index of the first item on this page (0 when empty). */
  start: number;
  /** 1-based index of the last item on this page (0 when empty). */
  end: number;
}

export interface UrlPagination {
  page: number;
  pageSize: number;
  setPage: (page: number) => void;
  setPageSize: (size: number) => void;
  /** Slice a full list down to the current page + compute display metadata. */
  paginate: <T>(items: T[]) => PaginatedSlice<T>;
}

export interface UrlPaginationOptions {
  /** Default page size (default 20). */
  defaultSize?: number;
  /** Query-param key for the page number (default "page"). */
  pageKey?: string;
  /** Query-param key for the page size (default "size"). */
  sizeKey?: string;
}

export function useUrlPagination(options: UrlPaginationOptions = {}): UrlPagination {
  const { defaultSize = 20, pageKey = "page", sizeKey = "size" } = options;

  const [rawPage, setRawPage] = useQueryState(
    pageKey,
    parseAsInteger.withDefault(1)
  );
  const [rawSize, setRawSize] = useQueryState(
    sizeKey,
    parseAsInteger.withDefault(defaultSize)
  );

  const pageSize = rawSize > 0 ? rawSize : defaultSize;
  const page = rawPage > 0 ? rawPage : 1;

  function setPage(p: number) {
    setRawPage(Math.max(1, Math.floor(p)));
  }
  function setPageSize(s: number) {
    setRawSize(Math.max(1, Math.floor(s)));
    setRawPage(1); // jumping size invalidates the current offset
  }

  function paginate<T>(items: T[]): PaginatedSlice<T> {
    const total = items.length;
    const pageCount = Math.max(1, Math.ceil(total / pageSize));
    const current = Math.min(Math.max(1, page), pageCount);
    const offset = (current - 1) * pageSize;
    const slice = items.slice(offset, offset + pageSize);
    return {
      items: slice,
      total,
      pageCount,
      page: current,
      start: total === 0 ? 0 : offset + 1,
      end: offset + slice.length,
    };
  }

  return { page, pageSize, setPage, setPageSize, paginate };
}
