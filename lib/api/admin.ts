import { apiFetch } from "./client";

export type UserRecord = {
  id: string;
  email: string;
  role: "user" | "admin";
  active?: boolean;
  created_at?: string;
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
  createUser: (body: { email: string; password: string; role?: "user" | "admin" }) =>
    apiFetch<UserRecord>("/admin/users", {
      method: "POST",
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
