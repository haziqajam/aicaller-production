import { apiFetch } from "./client";

export type SipTrunk = {
  seatId: string;
  name: string | null;
  sipUsername: string | null;
  registered: boolean;
  activeCalls: number;
  maxConcurrent: number;
  podId: string | null;
};
export type SipPod = {
  pod_id: string; host: string; status: string; cap: number; active: number;
  as_host?: string; as_port?: number;
};
export type SipTrunksView = { trunks: SipTrunk[]; pods: SipPod[] };

export const SipTrunks = {
  list: () => apiFetch<SipTrunksView>("/admin/sip/trunks"),
};
