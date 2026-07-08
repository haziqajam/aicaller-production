import { apiFetch } from "./client";

/**
 * A per-user Twilio credential preset ("account"). Exactly one is `active` per user
 * and drives every Twilio action across the app. The auth token is write-only: the
 * API returns it redacted as "***" (with `hasToken` true) and never the real value.
 */
export type TwilioPreset = {
  id: string;
  name: string;
  accountSid: string;
  phoneNumber: string | null;
  active: boolean;
  hasToken: boolean;
  /** Always "***" when a token is stored, else null. Never the real token. */
  authToken: "***" | null;
  created_at?: string;
};

export type TwilioPresetCreate = {
  name: string;
  accountSid: string;
  authToken: string;
  phoneNumber?: string | null;
};

export type TwilioPresetUpdate = {
  name?: string;
  accountSid?: string;
  /** Send "***" (the sentinel) to KEEP the stored token; any other value replaces it. */
  authToken?: string;
  phoneNumber?: string | null;
};

export const TwilioPresets = {
  list: () => apiFetch<TwilioPreset[]>("/twilio-presets"),
  create: (b: TwilioPresetCreate) =>
    apiFetch<{ id: string; active: boolean }>("/twilio-presets",
      { method: "POST", body: JSON.stringify(b) }),
  update: (id: string, b: TwilioPresetUpdate) =>
    apiFetch(`/twilio-presets/${id}`, { method: "PUT", body: JSON.stringify(b) }),
  remove: (id: string) => apiFetch(`/twilio-presets/${id}`, { method: "DELETE" }),
  activate: (id: string) =>
    apiFetch<{ id: string; active: boolean }>(`/twilio-presets/${id}/activate`,
      { method: "PUT" }),
};
