import { apiFetch } from "./client";

export type FleetRun = {
  id: string;
  campaignId: string;
  ownerId: string | null;
  provider?: string;
  status: string;
  leadCount: number;
  recommendedPods?: number;
  chosenPods?: number;
  estCost?: number;
  gpuType?: string;
  concurrencyPerPod?: number;
  /** How many pods were requested vs actually launched (set after provisioning). */
  podsRequested?: number;
  podsLaunched?: number;
  /** Human-readable note when fewer pods launched than requested (under-provisioned). */
  provisionWarning?: string | null;
  /** Launch behavior: dial on boot vs wait for Start; reap pods on drain vs keep up. */
  autoStart?: boolean;
  autoDestroy?: boolean;
  /** Live dialing gate — false while a "ready" fleet waits for Start. */
  dialingEnabled?: boolean;
  created_at?: string;
};

/** One live fleet (a run) grouped for the Fleets tab, with pod + funnel + cost rollups. */
export type FleetSummary = {
  id: string;
  campaignId: string;
  assistantName: string | null;
  ownerEmail: string | null;
  status: string;
  provider?: string;
  autoStart: boolean;
  autoDestroy: boolean;
  dialingEnabled: boolean;
  chosenPods?: number;
  podsRequested?: number;
  podsLaunched?: number;
  podCounts: Record<string, number>;
  podTotal: number;
  funnel: { total: number; called: number; failed: number; pending: number; locked: number; done: number };
  cost: { burnPerHr: number; spend: number };
  requestedAt?: string;
  startedAt?: string;
};

/** Campaign config embedded in a run detail (null when the campaign was deleted). */
export type FleetRunCampaign = {
  id: string;
  assistantId: string | null;
  assistantName: string | null;
  fromNumber: string | null;
  concurrency: number | null;
  delayBetweenCalls: number | null;
  maxCallDuration: number | null;
  listId: string | null;
  leadCount: number | null;
  status: string;
  created_at: string | null;
};

/** A sampled lead shown to the admin in the review dialog. */
export type LeadPreview = {
  id: string;
  name: string;
  phone: string;
  status: string | null;
  vars: Record<string, unknown>;
};

export type FleetRunDetail = FleetRun & {
  campaign: FleetRunCampaign | null;
  ownerEmail: string | null;
  /** First ~25 leads of the campaign so the admin can size the fleet from the list. */
  leadsPreview: LeadPreview[];
};

/** Pod lifecycle status. Includes recovery states (`missing`/`deprecated`) and
 *  the previously-undeclared `paused`. Unknown values degrade to a neutral badge. */
export type PodStatus =
  | "provisioning" | "running" | "idle" | "ready" | "paused"
  | "failed" | "terminated" | "missing" | "deprecated"
  | (string & {});

export type PodRecord = {
  id: string;
  runpodId: string;
  /** "vastai" | "runpod" — legacy pods (no value) are treated as RunPod. */
  provider?: string;
  /** Provider instance id (Vast) — runpodId mirrors it for back-compat. */
  providerId?: string | null;
  runId: string;
  shardIndex: number;
  status: PodStatus;
  /** Campaign pods are lead-bound; inbound pods hold warm capacity for inbound calls. */
  kind?: "campaign" | "inbound";
  gpuType: string;
  publicUrl: string | null;
  costPerHr: number;
  accumulatedCost: number;
  ownerId: string | null;
  /** Deployment timestamps (ISO-8601). created_at = pod-doc insert; startedAt = when
   *  the provider instance actually came up; terminatedAt = teardown. */
  created_at?: string | null;
  startedAt?: string | null;
  terminatedAt?: string | null;
  /** Last reconcile sighting (ISO-8601) — set when a pod is detected/marked missing. */
  lastSeenAt?: string | null;
  /** Health probe result, when known. */
  healthy?: boolean | null;
  /** Inbound routing token — join key into the inbound slot registry. */
  inboundToken?: string | null;
  /** Per-pod concurrent-call capacity (null => inherit the global default). */
  maxConcurrentCalls?: number | null;
  /** Per-pod model/prewarm overrides (null => inherit the pool prewarm config). */
  ollamaModels?: string[] | null;
  whisperModels?: string[] | null;
  prewarmVibeVoice?: boolean | null;
  /** Fingerprint of the code the pod self-registered with (null on pods that predate
   *  it). Differs from the control plane's ⇒ the pod's image is stale. */
  codeVersion?: string | null;
};

/** Fleet-global inbound prewarm config — how much warm inbound capacity to hold. */
export type InboundPrewarmConfig = {
  enabled: boolean;
  gpuType: string | null;
  region: string | null;
  warmPods: number;
  podImage: string | null;
  busyMessage: string;
  /** Optional hard cap on $/hr for prewarmed inbound pods (null = no cap). */
  maxPrice?: number | null;
  /** Boot-time model downloads each warm pod pulls, and whether it prewarms VibeVoice. */
  ollamaModels?: string[];
  whisperModels?: string[];
  prewarmVibeVoice?: boolean;
  /** AudioSocket TCP port for VICIdial/SIP direct connect. >0 provisions pods with the
   *  port mapped + advertises as_host:as_port. null => inherit global; 0 => disabled. */
  audiosocketPort?: number | null;
  updatedBy?: string | null;
  updatedAt?: string | null;
};

/** GPU × stack concurrency table (the deploy form computes ≈ N/pod from this).
 *  `table[tier][family]` = conservative concurrent-call ceiling. Numbers are the
 *  backend's single source of truth (caller/gpu_capacity.py). */
export type CapacityTable = {
  table: Record<string, Record<string, number>>;
  smallWhisper: string[];
  default: number;
};

/** A pod's PBX-bot roster (seats assigned to it) + capacity usage. */
export type PodRosterBot = {
  id: string;
  name: string | null;
  ownerId: string | null;
  maxConcurrent: number;
  activeCalls: number;
};
export type PodRoster = {
  podId: string;
  capacity: number;
  used: number;
  bots: PodRosterBot[];
};

/** A PBX bot (seat) across all users — the admin roster picker. */
export type AdminSeat = {
  id: string;
  name: string | null;
  ownerId: string | null;
  ownerEmail: string | null;
  maxConcurrent: number;
  podId: string | null;
  poolId: string | null;
};

/** Live inbound capacity slot — one row per warm pod's routing registration.
 *  `podId` equals a pod's `inboundToken` (join key into the pod list). */
export type InboundSlot = {
  podId: string;
  host: string;
  status: string;
  cap: number;
  active: number;
};

/** A campaign as listed in the admin Deploy dialog dropdown (cross-user). */
export type FleetCampaign = {
  id: string;
  ownerId: string | null;
  ownerEmail: string | null;
  assistantName: string | null;
  leadCount: number;
  hasNumberList: boolean;
  fromNumber: string | null;
  status: string | null;
};

// ── Vast offer preview (for the launch dialog) ──────────────────────────────
export type VastOffer = {
  id: number;
  gpu: string;
  numGpus: number;
  vramGb: number;
  ramGb: number;
  diskGb: number;
  dph: number | null;
  reliability: number;
  location: string;
};
export type OffersByGpu = { gpu: string; offers: VastOffer[]; error?: string };
export type OffersPreview = { region: string | null; maxPrice: number | null; gpus: OffersByGpu[] };

export type LaunchBody = {
  campaignId: string;
  pods: number;
  concurrency: number;
  gpus?: string;
  region?: string;
  maxPrice?: number;
  autoStart?: boolean;
  autoDestroy?: boolean;
  dryRun?: boolean;
  /** Pod image override — pick the registry per launch (GHCR mirror vs Docker
   *  Hub). Empty/omitted → the backend's FLEET_VAST_POD_IMAGE default. */
  podImage?: string;
  /** EXTRA Ollama models each pod pulls at boot (weights are no longer baked in
   *  the image). The campaign assistant/flow's own Ollama model is always pulled
   *  automatically — list additional ones here. Each adds a multi-GB download to
   *  pod boot; pods only report ready (and dial) after pulls finish. */
  ollamaModels?: string[];
  /** EXTRA faster-whisper sizes each pod prefetches at boot (the assistant's own
   *  whisper_local size + the default size are always prefetched automatically). */
  whisperModels?: string[];
};
export type LaunchDryRun = {
  dryRun: true;
  campaignId: string;
  leadCount: number;
  recommendation: { recommendedPods: number; chosenPods: number; estHours: number; estCost: number | null };
  offers: OffersPreview;
};
export type LaunchResult = { id: string; status: string; chosenPods: number };

export type RunMonitor = {
  runId: string;
  campaignId: string;
  status: string;
  pods: PodRecord[];
  funnel: {
    total: number; called: number; failed: number; locked: number;
    pending: number; done: number; remaining: number;
  };
  recentCalls: { to: string; status: string; durationSeconds: number | null; endedAt: string | null; callSid: string }[];
  cost: { burnPerHr: number; spend: number };
};

export type PodLogs = {
  provider: string;
  instanceId: string;
  tail: number;
  daemon: boolean;
  logs: string;
};

/** Server-paginated pod registry. `stats` aggregate the whole collection (not the page). */
export type PodsPage = {
  items: PodRecord[];
  total: number;
  stats: { activePods: number; burnPerHr: number; podSpend: number };
};
export type PodSortKey = "status" | "provider" | "gpu" | "costPerHr" | "spent" | "deployed" | "created" | "instance";
export type PodsQuery = { skip?: number; limit?: number; sort?: PodSortKey; dir?: "asc" | "desc" };

export const Fleet = {
  pods: (q: PodsQuery = {}) => {
    const qs = new URLSearchParams();
    if (q.skip != null) qs.set("skip", String(q.skip));
    if (q.limit != null) qs.set("limit", String(q.limit));
    if (q.sort) qs.set("sort", q.sort);
    if (q.dir) qs.set("dir", q.dir);
    const s = qs.toString();
    return apiFetch<PodsPage>(`/admin/fleet/pods${s ? `?${s}` : ""}`);
  },
  runs: () => apiFetch<FleetRun[]>("/admin/fleet/runs"),
  fleets: () => apiFetch<FleetSummary[]>("/admin/fleet/fleets"),
  runDetail: (id: string) => apiFetch<FleetRunDetail>(`/admin/fleet/runs/${id}`),
  allocations: () => apiFetch<any[]>("/admin/fleet/allocations"),
  terminatePod: (id: string) =>
    apiFetch(`/admin/fleet/pods/${id}/terminate`, { method: "POST" }),
  pausePod: (id: string) =>
    apiFetch<{ ok: boolean }>(`/admin/fleet/pods/${id}/pause`, { method: "POST" }),
  resumePod: (id: string) =>
    apiFetch<{ ok: boolean }>(`/admin/fleet/pods/${id}/resume`, { method: "POST" }),
  podLogs: (id: string, opts: { tail?: number; daemon?: boolean } = {}) => {
    const qs = new URLSearchParams();
    if (opts.tail) qs.set("tail", String(opts.tail));
    if (opts.daemon) qs.set("daemon", "true");
    const q = qs.toString();
    return apiFetch<PodLogs>(`/admin/fleet/pods/${id}/logs${q ? `?${q}` : ""}`);
  },
  approveRun: (id: string, mods: { chosenPods?: number; gpuType?: string; concurrencyPerPod?: number; autoStart?: boolean; autoDestroy?: boolean }) =>
    apiFetch(`/admin/fleet/runs/${id}/approve`, { method: "PUT", body: JSON.stringify(mods) }),
  rejectRun: (id: string, reason: string) =>
    apiFetch(`/admin/fleet/runs/${id}/reject`, { method: "PUT", body: JSON.stringify({ reason }) }),
  // ── Vast fleet ops ──
  campaigns: () => apiFetch<FleetCampaign[]>("/admin/fleet/campaigns"),
  offers: (p: { gpus?: string; region?: string; maxPrice?: number } = {}) => {
    const qs = new URLSearchParams();
    if (p.gpus) qs.set("gpus", p.gpus);
    if (p.region) qs.set("region", p.region);
    if (p.maxPrice) qs.set("maxPrice", String(p.maxPrice));
    return apiFetch<OffersPreview>(`/admin/fleet/offers?${qs.toString()}`);
  },
  launch: (b: LaunchBody) =>
    apiFetch<LaunchDryRun | LaunchResult>("/admin/fleet/launch", { method: "POST", body: JSON.stringify(b) }),
  startRun: (id: string) => apiFetch<{ ok: boolean; status: string }>(`/admin/fleet/runs/${id}/start`, { method: "POST" }),
  pauseRun: (id: string) => apiFetch<{ ok: boolean; paused: number }>(`/admin/fleet/runs/${id}/pause`, { method: "POST" }),
  resumeRun: (id: string) => apiFetch<{ ok: boolean; resumed: number }>(`/admin/fleet/runs/${id}/resume`, { method: "POST" }),
  destroyRun: (id: string) => apiFetch<{ ok: boolean; destroyed: number }>(`/admin/fleet/runs/${id}/destroy`, { method: "POST" }),
  redialRun: (id: string) => apiFetch<{ ok: boolean; status: number; body: string }>(`/admin/fleet/runs/${id}/redial`, { method: "POST" }),
  runMonitor: (id: string) => apiFetch<RunMonitor>(`/admin/fleet/runs/${id}/monitor`),
  // ── Inbound prewarm + pod recovery ──
  inboundConfig: () => apiFetch<InboundPrewarmConfig>("/admin/fleet/inbound/prewarm"),
  /** GPU × stack concurrency table for the deploy form's live "≈ N/pod" estimate. */
  capacityTable: () => apiFetch<CapacityTable>("/admin/fleet/capacity-table"),
  /** The control plane's code fingerprint + the default pod image. Pods register with
   *  their own fingerprint; a mismatch = the pod runs stale code (rebuild + push +
   *  redeploy the image). */
  codeVersion: () => apiFetch<{ version: string; defaultPodImage: string }>("/admin/fleet/code-version"),
  setInboundConfig: (b: Partial<InboundPrewarmConfig>) =>
    apiFetch<InboundPrewarmConfig>("/admin/fleet/inbound/prewarm", { method: "PUT", body: JSON.stringify(b) }),
  inboundPods: () => apiFetch<PodRecord[]>("/admin/fleet/inbound/pods"),
  /** Set which of the caller's numbers route to this inbound pod (full set-operation —
   *  numbers not in the list are detached). Calls to a pinned number run on this pod. */
  attachPodNumbers: (podId: string, numberIds: string[]) =>
    apiFetch<{ ok: boolean; attached: number }>(
      `/admin/fleet/inbound/pods/${podId}/numbers`,
      { method: "PUT", body: JSON.stringify({ numberIds }) }),
  inboundRegistry: () => apiFetch<InboundSlot[]>("/admin/fleet/inbound/registry"),
  reup: (podId: string) =>
    apiFetch<{ ok: boolean; id: string; status: string }>(`/admin/fleet/pods/${podId}/reup`, { method: "POST" }),
  reconcile: () =>
    apiFetch<{ ok: boolean; checked: number; missing: number }>("/admin/fleet/reconcile", { method: "POST" }),
  // ── Per-pod capacity + PBX-bot roster + model overrides ──
  setPodCapacity: (podId: string, maxConcurrentCalls: number) =>
    apiFetch<{ ok: boolean; maxConcurrentCalls: number }>(
      `/admin/fleet/pods/${podId}/capacity`,
      { method: "PATCH", body: JSON.stringify({ maxConcurrentCalls }) }),
  allSeats: (unassigned = false) =>
    apiFetch<AdminSeat[]>(`/admin/fleet/seats${unassigned ? "?unassigned=1" : ""}`),
  podBots: (podId: string) => apiFetch<PodRoster>(`/admin/fleet/pods/${podId}/bots`),
  addPodBot: (podId: string, seatId: string) =>
    apiFetch<{ ok: boolean }>(`/admin/fleet/pods/${podId}/bots`,
      { method: "POST", body: JSON.stringify({ seatId }) }),
  /** Attach one or more bots at once (full set-operation: listed = on this pod, others detached). */
  setPodBots: (podId: string, seatIds: string[]) =>
    apiFetch<{ ok: boolean; attached: number; detached: number; warning: string | null }>(
      `/admin/fleet/pods/${podId}/bots`,
      { method: "PUT", body: JSON.stringify({ seatIds }) }),
  removePodBot: (podId: string, seatId: string) =>
    apiFetch<{ ok: boolean }>(`/admin/fleet/pods/${podId}/bots/${seatId}`, { method: "DELETE" }),
  /** Move EVERY bot rostered on this pod to another pod in one action (e.g. off a dead
   *  pod). Capacity-checked against the target; in-flight calls are unaffected. */
  movePodBots: (podId: string, targetPodId: string) =>
    apiFetch<{ ok: boolean; moved: number; targetPodId: string }>(
      `/admin/fleet/pods/${podId}/move-bots`,
      { method: "POST", body: JSON.stringify({ targetPodId }) }),
  setPodModels: (podId: string, b: {
    ollamaModels?: string[]; whisperModels?: string[]; prewarmVibeVoice?: boolean;
  }) =>
    apiFetch<{ ok: boolean }>(`/admin/fleet/pods/${podId}/models`,
      { method: "PATCH", body: JSON.stringify(b) }),
};
