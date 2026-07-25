import { apiFetch } from "./client";

export type Tier = "basic" | "pro" | "ultra";

export type UserRecord = {
  id: string;
  email: string;
  role: "user" | "admin";
  active?: boolean;
  created_at?: string;
  /** Plan tier + effective limits (null => unlimited / all engines allowed). */
  tier?: Tier | null;
  maxSeats?: number | null;
  llmProviderAllowList?: string[] | null;
  sttEngineAllowList?: string[] | null;
  ttsEngineAllowList?: string[] | null;
};

/** Set a user's tier and/or per-user limit overrides. Providing `tier` re-applies
 *  that tier's preset defaults; any override field also sent is layered on top. */
export type SetTierBody = {
  tier?: Tier | null;
  maxSeats?: number | null;
  llmProviderAllowList?: string[] | null;
  sttEngineAllowList?: string[] | null;
  ttsEngineAllowList?: string[] | null;
};

export type AdminNumberRecord = {
  id: string;
  phoneNumber: string;
  assistantId?: string | null;
  assistantName?: string | null;
  ownerId?: string | null;
  ownerEmail?: string | null;
};

export type AdminNumberUpdate = {
  ownerId?: string | null;
  assistantId?: string | null;
};

export const Admin = {
  listUsers: () => apiFetch<UserRecord[]>("/admin/users"),
  createUser: (body: { email: string; password: string; role?: "user" | "admin"; tier?: Tier }) =>
    apiFetch<UserRecord>("/admin/users", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  setTier: (id: string, body: SetTierBody) =>
    apiFetch<UserRecord>(`/admin/users/${id}/tier`, {
      method: "PUT",
      body: JSON.stringify(body),
    }),
  setRole: (id: string, role: "user" | "admin") =>
    apiFetch<UserRecord>(`/admin/users/${id}/role`, {
      method: "PUT",
      body: JSON.stringify({ role }),
    }),
  deactivate: (id: string) =>
    apiFetch<UserRecord>(`/admin/users/${id}/deactivate`, {
      method: "PUT",
    }),
  reactivate: (id: string) =>
    apiFetch<UserRecord>(`/admin/users/${id}/reactivate`, {
      method: "PUT",
    }),
  deleteUser: (id: string) =>
    apiFetch<void>(`/admin/users/${id}`, {
      method: "DELETE",
    }),
  listNumbers: () => apiFetch<AdminNumberRecord[]>("/admin/numbers"),
  updateNumber: (id: string, body: AdminNumberUpdate) =>
    apiFetch<AdminNumberRecord>(`/admin/numbers/${id}`, {
      method: "PUT",
      body: JSON.stringify(body),
    }),
  deleteNumber: (id: string) =>
    apiFetch<void>(`/admin/numbers/${id}`, {
      method: "DELETE",
    }),
};
