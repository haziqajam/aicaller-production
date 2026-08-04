import { apiFetch } from "./client";
import type {
  Assistant, Campaign, Flow, Tool, Lead, LeadList, NumberList, NumberListMember,
} from "./schemas";

// Server-side pagination envelope. Endpoints converted to true (DB-level) paging
// return this instead of a bare array: `items` is the requested window, `total` is
// the full match count (for "X of N" + page count). See db.paginate on the backend.
export type Paginated<T> = { items: T[]; total: number };

export type PageParams = {
  skip: number;
  limit: number;
  q?: string;
  status?: string;
  source?: string;
};

function pageQuery(p: PageParams): string {
  const qs = new URLSearchParams();
  qs.set("skip", String(p.skip));
  qs.set("limit", String(p.limit));
  if (p.q) qs.set("q", p.q);
  if (p.status) qs.set("status", p.status);
  if (p.source) qs.set("source", p.source);
  return qs.toString();
}

// ─── End-call analysis result shapes ──────────────────────────────────────────
export type QuestionType = "boolean" | "descriptive" | "json";
// answer shape depends on `type`:
//   boolean     → true=yes / false=no / null=unknown
//   descriptive → string (the answer) or null
//   json        → object/array (parsed) or null
export type AnalysisAnswer = {
  id: string;
  text: string;
  type?: QuestionType;
  answer: boolean | null | string | Record<string, unknown> | unknown[];
  evidence: string;
};
export type CallAnalysis = {
  status: "scored" | "cached" | "no_transcript" | "no_questions";
  questionsHash?: string;
  model?: string;
  analyzedAt?: string;
  answers: AnalysisAnswer[];
};
export type AnalysisAggregate = {
  id: string;
  text: string;
  type?: QuestionType;
  // boolean rollup
  yes?: number;
  no?: number;
  unknown?: number;
  // descriptive/json rollup (not count-aggregatable)
  answered?: number;
  total?: number;
};
export type CampaignAnalysis = {
  status: "ok" | "no_questions";
  questions: { id: string; text: string; type?: QuestionType }[];
  calls: (CallAnalysis & { callId: string })[];
  aggregate: AnalysisAggregate[];
};

export const Assistants = {
  list: () => apiFetch<Assistant[]>("/assistants"),
  get: (id: string) => apiFetch<Assistant>(`/assistants/${id}`),
  create: (a: Assistant) => apiFetch<{ id: string }>("/assistants",
    { method: "POST", body: JSON.stringify(a) }),
  update: (id: string, a: Assistant) => apiFetch(`/assistants/${id}`,
    { method: "PUT", body: JSON.stringify(a) }),
  remove: (id: string) => apiFetch(`/assistants/${id}`, { method: "DELETE" }),
  prewarm: (id: string) => apiFetch(`/assistants/${id}/prewarm`, { method: "POST" }),
};

export type CampaignsListParams = {
  skip: number;
  limit: number;
  q?: string;
  status?: string;
};

export const Campaigns = {
  // Server-side paginated campaigns. The status facet and `q` (over fromNumber)
  // are applied IN THE DB, so they cover ALL the caller's campaigns, not just the
  // loaded page. NOTE: assistant NAME isn't on the campaign doc, so name search
  // stays a client concern. Returns {items, total}.
  list: (params: CampaignsListParams) => {
    const qs = new URLSearchParams();
    qs.set("skip", String(params.skip));
    qs.set("limit", String(params.limit));
    if (params.q) qs.set("q", params.q);
    if (params.status) qs.set("status", params.status);
    return apiFetch<Paginated<Campaign>>(`/campaigns?${qs.toString()}`);
  },
  get: (id: string) => apiFetch<Campaign>(`/campaigns/${id}`),
  create: (c: Campaign) => apiFetch<{ id: string }>("/campaigns",
    { method: "POST", body: JSON.stringify(c) }),
  start: (id: string) => apiFetch(`/start_campaign/${id}`, { method: "POST" }),
  stop: (id: string) => apiFetch(`/stop_campaign/${id}`, { method: "POST" }),
  progress: (id: string) => apiFetch<{ total: number; called: number; failed: number; remaining: number }>(`/campaigns/${id}/progress`),
  // End-call analysis: lazily score the campaign's calls against the ASSISTANT's
  // questions (cached server-side; cheap to re-call). Questions are edited on the
  // assistant (assistant editor), not the campaign.
  analyze: (id: string) =>
    apiFetch<CampaignAnalysis>(`/campaigns/${id}/analysis`, { method: "POST" }),
};

export const Leads = {
  list: () => apiFetch<Lead[]>("/leads"),
  // listId attaches the imported masters to a list in one call (R7).
  import: (leads: Lead[], listId?: string) =>
    apiFetch<{ inserted: number }>(`/leads/import${listId ? `?listId=${listId}` : ""}`,
      { method: "POST", body: JSON.stringify({ leads }) }),
  remove: (id: string) => apiFetch(`/leads/${id}`, { method: "DELETE" }),
  removeMany: (ids: string[]) => apiFetch<{ deleted: number }>("/leads/delete",
    { method: "POST", body: JSON.stringify({ ids }) }),
};

// Place a single outbound call that runs the WS bot pipeline — no campaign, no
// app-managed number. `fromNumber` may be a verified caller ID (or omitted to use
// the account default). PSTN egress still goes through Twilio.
export const Outbound = {
  call: (body: { assistantId: string; to: string; fromNumber?: string; maxCallDuration?: number }) =>
    apiFetch<{ callSid: string; status: string; to: string; fromNumber: string }>(
      "/outbound-call", { method: "POST", body: JSON.stringify(body) }),
};

// Pipecat Flows — a parallel agent type alongside Assistants. Same CRUD shape;
// tested in the browser via /ws-flow (see FlowCallDialog) and attachable to
// campaigns via campaign.flowId.
export const Flows = {
  list: () => apiFetch<Flow[]>("/flows"),
  get: (id: string) => apiFetch<Flow>(`/flows/${id}`),
  create: (f: Flow) => apiFetch<{ id: string }>("/flows",
    { method: "POST", body: JSON.stringify(f) }),
  update: (id: string, f: Flow) => apiFetch(`/flows/${id}`,
    { method: "PUT", body: JSON.stringify(f) }),
  remove: (id: string) => apiFetch(`/flows/${id}`, { method: "DELETE" }),
};

export const Tools = {
  list: () => apiFetch<Tool[]>("/tools"),
  get: (id: string) => apiFetch<Tool>(`/tools/${id}`),
  create: (t: Tool) => apiFetch<{ id: string }>("/tools",
    { method: "POST", body: JSON.stringify(t) }),
  update: (id: string, t: Tool) => apiFetch(`/tools/${id}`,
    { method: "PUT", body: JSON.stringify(t) }),
  remove: (id: string) => apiFetch(`/tools/${id}`, { method: "DELETE" }),
};

export const LeadLists = {
  list: () => apiFetch<LeadList[]>("/lead-lists"),
  get: (id: string) => apiFetch<LeadList>(`/lead-lists/${id}`),
  create: (b: { name: string; description?: string }) =>
    apiFetch<{ id: string }>("/lead-lists", { method: "POST", body: JSON.stringify(b) }),
  update: (id: string, b: { name: string; description?: string }) =>
    apiFetch(`/lead-lists/${id}`, { method: "PUT", body: JSON.stringify(b) }),
  remove: (id: string) => apiFetch(`/lead-lists/${id}`, { method: "DELETE" }),
  // Server-side paginated MEMBER leads of a list (search/facets applied in the DB,
  // so they cover the whole list, not just the loaded page).
  listLeads: (id: string, params: PageParams) =>
    apiFetch<Paginated<Lead>>(`/lead-lists/${id}/leads?${pageQuery(params)}`),
  addLeads: (id: string, ids: string[]) =>
    apiFetch<{ ok: boolean; count: number }>(`/lead-lists/${id}/leads`,
      { method: "POST", body: JSON.stringify({ ids }) }),
  removeLeads: (id: string, ids: string[]) =>
    apiFetch(`/lead-lists/${id}/leads/remove`,
      { method: "POST", body: JSON.stringify({ ids }) }),
};

export const NumberLists = {
  list: () => apiFetch<NumberList[]>("/number-lists"),
  get: (id: string) => apiFetch<NumberList>(`/number-lists/${id}`),
  create: (b: { name: string; description?: string }) =>
    apiFetch<{ id: string }>("/number-lists", { method: "POST", body: JSON.stringify(b) }),
  update: (id: string, b: { name: string; description?: string }) =>
    apiFetch(`/number-lists/${id}`, { method: "PUT", body: JSON.stringify(b) }),
  // Deleting a list RELEASES its member numbers back to Twilio (best-effort);
  // `failed` lists any that couldn't be released (e.g. still routed to an agent).
  remove: (id: string) =>
    apiFetch<{ ok: boolean; releasedCount: number; failed: { id: string; phoneNumber?: string; error: string }[] }>(
      `/number-lists/${id}`, { method: "DELETE" }),
  // The list's member numbers, resolved to their phone strings (own numbers only).
  listNumbers: (id: string) =>
    apiFetch<NumberListMember[]>(`/number-lists/${id}/numbers`),
  addNumbers: (id: string, ids: string[]) =>
    apiFetch<{ ok: boolean; count: number }>(`/number-lists/${id}/numbers`,
      { method: "POST", body: JSON.stringify({ ids }) }),
  removeNumbers: (id: string, ids: string[]) =>
    apiFetch(`/number-lists/${id}/numbers/remove`,
      { method: "POST", body: JSON.stringify({ ids }) }),
};

export type RunRecommendation = {
  leadCount: number; recommendedPods: number; chosenPods: number;
  concurrencyPerPod: number; callsPerHrPerPod: number; estHours: number;
  estCost: number | null;
};
export const CampaignRuns = {
  recommend: (cid: string, pods?: number) =>
    apiFetch<RunRecommendation>(
      `/campaigns/${cid}/run-recommendation${pods ? `?pods=${pods}` : ""}`),
  // Launch is always a request — an admin reviews and provisions. No preset/sizing
  // is chosen here; the user just submits the campaign.
  create: (campaignId: string) =>
    apiFetch<{ id: string; status: string }>("/campaign-runs",
      { method: "POST", body: JSON.stringify({ campaignId }) }),
  get: (id: string) => apiFetch<any>(`/campaign-runs/${id}`),
  // Server-side paginated run requests (owner-scoped, newest-first). Returns
  // {items, total}.
  list: (params: PageParams) =>
    apiFetch<Paginated<any>>(`/campaign-runs?${pageQuery(params)}`),
};

export type AvailableNumber = {
  phoneNumber: string;
  friendlyName: string;
  locality: string | null;
  region: string | null;
  postalCode: string | null;
  isoCountry: string;
  addressRequirements: string;
  beta: boolean;
  capabilities: { voice: boolean; sms: boolean; mms: boolean; fax: boolean };
};

export type NumberFilters = {
  country?: string;
  type?: string;
  areaCode?: string;
  contains?: string;
  smsEnabled?: boolean;
  mmsEnabled?: boolean;
  voiceEnabled?: boolean;
  inLocality?: string;
  inRegion?: string;
  limit?: number;
};

export const Numbers = {
  list: () => apiFetch<any[]>("/numbers"),
  map: (id: string, assistantId: string) => apiFetch(`/numbers/${id}/assistant`,
    { method: "PUT", body: JSON.stringify({ assistantId }) }),
  available: (filters: NumberFilters = {}) => {
    const params = new URLSearchParams();
    if (filters.country) params.set("country", filters.country);
    if (filters.type) params.set("type", filters.type);
    if (filters.areaCode) params.set("area_code", filters.areaCode);
    if (filters.contains) params.set("contains", filters.contains);
    if (filters.smsEnabled !== undefined) params.set("sms_enabled", String(filters.smsEnabled));
    if (filters.mmsEnabled !== undefined) params.set("mms_enabled", String(filters.mmsEnabled));
    if (filters.voiceEnabled !== undefined) params.set("voice_enabled", String(filters.voiceEnabled));
    if (filters.inLocality) params.set("in_locality", filters.inLocality);
    if (filters.inRegion) params.set("in_region", filters.inRegion);
    if (filters.limit !== undefined) params.set("limit", String(filters.limit));
    const qs = params.toString();
    return apiFetch<AvailableNumber[]>(`/api/twilio/available${qs ? `?${qs}` : ""}`);
  },
  buy: (num: {
    phoneNumber: string;
    isoCountry?: string;
    region?: string | null;
    locality?: string | null;
    postalCode?: string | null;
    friendlyName?: string;
    capabilities?: { voice: boolean; sms: boolean; mms: boolean; fax: boolean };
  }) =>
    apiFetch<{ id: string; phoneNumber: string }>("/api/twilio/buy",
      { method: "POST", body: JSON.stringify(num) }),
  releaseMany: (ids: string[]) =>
    apiFetch<{
      released: string[];
      releasedCount: number;
      failed: { id: string; phoneNumber?: string; error: string }[];
    }>("/api/twilio/release", { method: "POST", body: JSON.stringify({ ids }) }),
  /** Live Twilio numbers on the active account NOT yet managed in our DB (import
   * candidates). Empty when there's no active preset. */
  importable: () => apiFetch<{ phoneNumber: string; friendlyName?: string;
    twilioSid?: string; isoCountry?: string; source: string; importable: boolean }[]>(
    "/numbers/importable"),
  /** Bring live Twilio numbers (on the active account, not yet in our DB) under
   * management. Backend stamps the active preset as their origin account. */
  importFromTwilio: (phoneNumbers: string[]) =>
    apiFetch<{
      imported: string[];
      importedCount: number;
      failed: { phoneNumber: string; error: string }[];
    }>("/numbers/import", { method: "POST", body: JSON.stringify({ phoneNumbers }) }),
};

export type CallsListParams = {
  skip: number;
  limit: number;
  direction?: string;
  campaignId?: string;
  q?: string;
  status?: string;
  dateFrom?: string;
  dateTo?: string;
};

export const Calls = {
  // Server-side paginated calls. Search (`q` over to/from/callSid), the status
  // facet and the requestedAt date range are applied IN THE DB, so they cover the
  // whole history, not just the loaded page. Returns {items, total}.
  list: (params: CallsListParams) => {
    const qs = new URLSearchParams();
    qs.set("skip", String(params.skip));
    qs.set("limit", String(params.limit));
    if (params.direction) qs.set("direction", params.direction);
    if (params.campaignId) qs.set("campaignId", params.campaignId);
    if (params.q) qs.set("q", params.q);
    if (params.status) qs.set("status", params.status);
    if (params.dateFrom) qs.set("dateFrom", params.dateFrom);
    if (params.dateTo) qs.set("dateTo", params.dateTo);
    return apiFetch<Paginated<any>>(`/calls?${qs.toString()}`);
  },
  get: (id: string) => apiFetch<any>(`/calls/${id}`),
  recording: (id: string) => apiFetch<{ url: string }>(`/calls/${id}/recording`),
  // Score this call against its campaign's analysis questions (cached server-side).
  analyze: (id: string) =>
    apiFetch<CallAnalysis>(`/calls/${id}/analysis`, { method: "POST" }),
};

export type ApiKey = {
  id: string;
  name: string;
  hint: string;
  createdAt?: string;
  expiresAt?: string | null;
  lastUsedAt?: string | null;
  revoked: boolean;
};

export const ApiKeys = {
  list: () => apiFetch<ApiKey[]>("/api-keys"),
  // Returns the plaintext `key` exactly ONCE — surface it to the user immediately.
  create: (body: { name?: string; expiresAt?: string | null }) =>
    apiFetch<{ id: string; name: string; hint: string; expiresAt: string | null; key: string }>(
      "/api-keys",
      { method: "POST", body: JSON.stringify(body) }
    ),
  revoke: (id: string) =>
    apiFetch<{ ok: boolean }>(`/api-keys/${id}`, { method: "DELETE" }),
};

/**
 * A NeuTTS speaker reference. `builtin` voices are baked into the pod image and
 * shared by every tenant; `cloned` ones were uploaded by this owner and encoded
 * by the Encoder Service — which is why they carry a status.
 */
export type Voice = {
  id: string;
  name: string;
  displayName: string;
  engine: string;
  source: "builtin" | "cloned";
  status: "encoding" | "ready" | "failed";
  error: string | null;
  createdAt: string | null;
};

export const Voices = {
  /**
   * Legacy engine -> voice-list map (GET /api/voices). Still the fallback seed
   * for the FIXED engines; it knows nothing about cloned voices.
   */
  catalog: () => apiFetch<Record<string, string[]>>("/api/voices"),
  /** The owner's voices + the global builtins, for engines with dynamic voices. */
  list: (engine = "neutts") =>
    apiFetch<Voice[]>(`/voices?engine=${encodeURIComponent(engine)}`),
  get: (id: string) => apiFetch<Voice>(`/voices/${id}`),
  remove: (id: string) =>
    apiFetch<{ ok: boolean }>(`/voices/${id}`, { method: "DELETE" }),
  /**
   * Upload a clip + transcript and start an encode. multipart/form-data, so the
   * Content-Type header is deliberately UNSET — the browser must supply it with
   * the generated multipart boundary, and apiFetch's JSON default would break it.
   */
  clone: (body: {
    audio: File;
    transcript: string;
    displayName: string;
    name?: string;
    consent: boolean;
  }) => {
    const fd = new FormData();
    fd.append("audio", body.audio);
    fd.append("transcript", body.transcript);
    fd.append("displayName", body.displayName);
    if (body.name) fd.append("name", body.name);
    fd.append("consent", String(body.consent));
    return apiFetch<{ id: string; status: Voice["status"]; error?: string }>(
      "/voices/clone",
      { method: "POST", body: fd }
    );
  },
};

export const Auth = {
  login: (email: string, password: string) =>
    apiFetch<{ token: string; role: string }>("/auth/login",
      { method: "POST", body: JSON.stringify({ email, password }) }),
};
