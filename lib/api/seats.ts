import { apiFetch } from "./client";

/**
 * A "bot seat" for VICIdial direct connect over AudioSocket. Each seat = one
 * concurrent call; a client buys N seats for N concurrent calls. A seat is driven
 * by exactly one agent (an assistant OR a flow), can carry transfer targets (the
 * client's in-group / extension the AI routes to), and optional AMI credentials
 * for out-of-band DTMF (PlayDTMF). The AMI secret is write-only — the API returns
 * `hasSecret` but never the value.
 */
export type SeatTransferTarget = {
  /** Human label the model may reference. */
  label: string;
  /** In-group / extension the CLIENT's dialplan understands. */
  value: string;
};

export type SeatAmiPublic = {
  host: string;
  port: number;
  user: string;
  hasSecret: boolean;
};

export type BotSeat = {
  id: string;
  name: string;
  assistantId: string | null;
  flowId: string | null;
  maxConcurrent: number;
  amdEnabled: boolean;
  activeCalls: number;
  active: boolean;
  transferTargets: SeatTransferTarget[];
  ami: SeatAmiPublic | null;
  notes: string;
  sipEnabled: boolean;
  sipUsername: string | null;
  returnTarget: string | null;
  sipServerHost: string | null;
  /** Pod-pool binding. null => whole warm pool (default). */
  poolId: string | null;
  /** Roster pin — the specific pod this bot is assigned to (admin-managed via the
   *  fleet Pods page). null => not pinned. Read-only here. */
  podId?: string | null;
  /** Can a call to this seat connect right now, and on its preferred capacity?
   *  ok = ready; degraded = preferred pod/pool down but warm-pool fallback carries
   *  it; down = no capacity, an allocate would fail. Infra (pods/pools) stays behind
   *  the admin wall — this is the one word clients get. */
  routeHealth?: "ok" | "degraded" | "down";
  /** Present ONLY in the response that just minted/rotated it — copy it now. */
  sipPassword?: string;
  createdAt?: string;
  updatedAt?: string;
};

export type SeatAmiInput = {
  host: string;
  port: number;
  user: string;
  /** Send "***" (or omit) to KEEP the stored secret; any other value replaces it. */
  secret?: string;
};

export type BotSeatCreate = {
  name: string;
  assistantId?: string | null;
  flowId?: string | null;
  maxConcurrent?: number;
  amdEnabled?: boolean;
  active?: boolean;
  transferTargets?: SeatTransferTarget[];
  ami?: SeatAmiInput | null;
  notes?: string;
  sipEnabled?: boolean;
  returnTarget?: string | null;
  poolId?: string | null;
};

export type BotSeatUpdate = Partial<BotSeatCreate>;

export const Seats = {
  list: () => apiFetch<BotSeat[]>("/audiosocket/seats"),
  create: (b: BotSeatCreate) =>
    apiFetch<BotSeat>("/audiosocket/seats", { method: "POST", body: JSON.stringify(b) }),
  update: (id: string, b: BotSeatUpdate) =>
    apiFetch<BotSeat>(`/audiosocket/seats/${id}`, { method: "PATCH", body: JSON.stringify(b) }),
  remove: (id: string) =>
    apiFetch(`/audiosocket/seats/${id}`, { method: "DELETE" }),
  reset: (id: string) =>
    apiFetch(`/audiosocket/seats/${id}/reset`, { method: "POST" }),
  rotateSip: (id: string) =>
    apiFetch<BotSeat>(`/audiosocket/seats/${id}/rotate-sip`, { method: "POST" }),
};
