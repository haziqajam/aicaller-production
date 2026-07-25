import { apiFetch } from "./client";

/**
 * Fleet alerts — persistent admin notifications raised when a GPU pod dies, gets
 * re-upped, or its pool/numbers are rebound. Surfaced in the VICIdial → Alerts page
 * so an operator knows a server churned even though the client's calls kept flowing.
 */
export type FleetAlert = {
  id: string;
  level: "info" | "critical" | string;
  kind: "pod_dead" | "pod_reup" | "rebind" | string;
  podId?: string | null;
  poolId?: string | null;
  message: string;
  detail: Record<string, unknown>;
  createdAt?: string;
  acknowledged: boolean;
  acknowledgedBy?: string | null;
};

export const Alerts = {
  list: (unacked = false) =>
    apiFetch<FleetAlert[]>(`/admin/fleet/alerts${unacked ? "?unacked=1" : ""}`),
  ack: (id: string) =>
    apiFetch(`/admin/fleet/alerts/${id}/ack`, { method: "POST" }),
};
