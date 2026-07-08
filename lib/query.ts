import { QueryClient } from "@tanstack/react-query";

export const POLL = { live: 3000, off: false as const };

export function makeQueryClient() {
  return new QueryClient({
    defaultOptions: { queries: { staleTime: 10_000, retry: 1, refetchOnWindowFocus: false } },
  });
}
