import { apiFetch } from "./client";

/**
 * Pod pools — an indirection between bot seats and GPU pods. A seat attaches to a
 * pool; the admin can swap the pool's underlying pod at any time (servers are
 * destroyed/recreated daily) without touching seats OR the client's VICIdial. Pod
 * keys are the registry key `inboundToken || podId`.
 */
export type BotPool = {
  id: string;
  name: string;
  memberPodKeys: string[];
  lastRebindAt?: string | null;
  createdAt?: string;
  updatedAt?: string;
};

export type PoolSummary = { id: string; name: string; podCount: number };

export type BotPoolCreate = { name: string; memberPodKeys?: string[] };
export type BotPoolUpdate = { name?: string; memberPodKeys?: string[] };
export type PoolSwapBody = { oldPodKey?: string | null; newPodKey: string };

export const Pools = {
  // Admin CRUD + swap.
  list: () => apiFetch<BotPool[]>("/admin/fleet/pools"),
  create: (b: BotPoolCreate) =>
    apiFetch<BotPool>("/admin/fleet/pools", { method: "POST", body: JSON.stringify(b) }),
  update: (id: string, b: BotPoolUpdate) =>
    apiFetch<BotPool>(`/admin/fleet/pools/${id}`, { method: "PATCH", body: JSON.stringify(b) }),
  remove: (id: string) =>
    apiFetch(`/admin/fleet/pools/${id}`, { method: "DELETE" }),
  swap: (id: string, b: PoolSwapBody) =>
    apiFetch<BotPool>(`/admin/fleet/pools/${id}/swap`, { method: "POST", body: JSON.stringify(b) }),
  // Read-only list for the seat editor's pool selector (any signed-in user).
  listForSeat: () => apiFetch<PoolSummary[]>("/audiosocket/pools"),
};
