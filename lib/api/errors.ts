/**
 * Centralised API error handling.
 *
 * The backend (FastAPI) returns errors in a few shapes:
 *   - {"detail": "human readable string"}                          (most 4xx)
 *   - {"detail": [{loc, msg, type, ...}, ...]}                     (422 validation)
 *   - opaque 5xx bodies, HTML, or empty bodies
 * and the network layer can fail entirely (server down, CORS, offline).
 *
 * End users should never see raw JSON. `parseApiError` turns any thrown value
 * into a clean sentence; `toastApiError` shows it in a toast with the action
 * that failed as the title.
 */
import { toast } from "sonner";
import { ApiError } from "./client";

/** One item from a FastAPI 422 validation response. */
interface ValidationItem {
  type?: string;
  loc?: (string | number)[];
  msg?: string;
  input?: unknown;
}

/** Friendly labels for known field paths, so messages read naturally. */
const FIELD_LABELS: Record<string, string> = {
  name: "Name",
  systemPrompt: "System prompt",
  firstMessage: "Opening message",
  "llm.provider": "LLM provider",
  "llm.model": "LLM model",
  "stt.engine": "Speech-to-text engine",
  "stt.language": "Language",
  "tts.engine": "Text-to-speech engine",
  "tts.voice": "Voice",
  assistantId: "Assistant",
  fromNumber: "From number",
  concurrency: "Concurrency",
  delayBetweenCalls: "Delay between calls",
  maxCallDuration: "Max call duration",
  email: "Email",
  password: "Password",
  phoneNumber: "Phone number",
};

/** Turn a loc path like ["body","tts","engine"] into "Text-to-speech engine". */
function fieldLabel(loc?: (string | number)[]): string | null {
  if (!loc?.length) return null;
  const parts = loc.filter(
    (p) => typeof p === "string" && p !== "body" && p !== "query" && p !== "path"
  ) as string[];
  if (!parts.length) return null;
  const key = parts.join(".");
  if (FIELD_LABELS[key]) return FIELD_LABELS[key];
  // Fall back to the last meaningful segment, prettified.
  const last = parts[parts.length - 1];
  return last.charAt(0).toUpperCase() + last.slice(1).replace(/([A-Z])/g, " $1");
}

function humanizeMsg(msg: string): string {
  return msg.trim().replace(/\.$/, "");
}

function tryParseJson(s: string): unknown {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}

function looksLikeJsonOrHtml(s: string): boolean {
  const t = s.trim();
  return t.startsWith("{") || t.startsWith("[") || t.startsWith("<");
}

/**
 * Convert any thrown value into a clean, human-readable message.
 * @param fallback shown when nothing more specific can be derived.
 */
export function parseApiError(
  err: unknown,
  fallback = "Something went wrong. Please try again."
): string {
  // Network failure: fetch throws a TypeError before any response.
  if (err instanceof TypeError && /fetch|network|load failed/i.test(err.message)) {
    return "Can't reach the server. Check that the backend is running and try again.";
  }

  if (err instanceof ApiError) {
    if (err.status === 401)
      return "Your session has expired. Please sign in again.";
    if (err.status === 403) return "You don't have permission to do that.";

    const body = (err.message ?? "").trim();
    const parsed = tryParseJson(body);

    if (parsed && typeof parsed === "object") {
      const detail = (parsed as { detail?: unknown }).detail;

      if (typeof detail === "string" && detail.trim()) return detail.trim();

      if (Array.isArray(detail)) {
        const msgs = (detail as ValidationItem[])
          .map((item) => {
            const label = fieldLabel(item.loc);
            const m = item.msg ? humanizeMsg(item.msg) : "is invalid";
            return label ? `${label}: ${m}` : m;
          })
          .filter(Boolean);
        const unique = Array.from(new Set(msgs));
        if (unique.length)
          return unique.slice(0, 3).join("; ") + (unique.length > 3 ? "; …" : "");
      }

      // Some handlers use {message} or {error} instead of {detail}.
      const alt =
        (parsed as { message?: unknown }).message ??
        (parsed as { error?: unknown }).error;
      if (typeof alt === "string" && alt.trim()) return alt.trim();
    }

    // Plain-text body (not JSON/HTML) — safe to show directly.
    if (body && !looksLikeJsonOrHtml(body)) return body;

    // Opaque body: fall back to a status-appropriate sentence.
    if (err.status === 404) return "We couldn't find what you were looking for.";
    if (err.status === 409)
      return "That conflicts with something that already exists.";
    if (err.status === 429) return "Too many requests — please slow down and retry.";
    if (err.status === 503)
      return "That service is unavailable right now. Please try again shortly.";
    if (err.status >= 500)
      return "The server hit an error. Please try again in a moment.";
    return fallback;
  }

  if (err instanceof Error && err.message.trim()) return err.message.trim();
  return fallback;
}

/**
 * Show a friendly error toast.
 * @param context the action that failed — becomes the toast title
 *   (e.g. "Couldn't save assistant"). The parsed cause becomes the description.
 * @returns the parsed message (handy for also setting inline state).
 */
export function toastApiError(
  err: unknown,
  context = "Something went wrong"
): string {
  const detail = parseApiError(err, context);
  if (detail === context) {
    toast.error(context);
  } else {
    toast.error(context, { description: detail });
  }
  return detail;
}
