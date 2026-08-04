import { getToken, logout } from "@/lib/auth";

// When NEXT_PUBLIC_API_BASE is unset, default to the LOCAL backend (not a random
// stale ngrok URL, which silently 404s as "offline" and looks like a CORS error).
const FALLBACK_API_BASE = "http://localhost:7860";
export const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? FALLBACK_API_BASE;

if (typeof window !== "undefined" && !process.env.NEXT_PUBLIC_API_BASE) {
  // eslint-disable-next-line no-console
  console.warn(
    `[api] NEXT_PUBLIC_API_BASE is not set — falling back to ${FALLBACK_API_BASE}. ` +
      `If your backend is remote (e.g. ngrok), set NEXT_PUBLIC_API_BASE in ` +
      `aidevgen_caller/.env.local and RESTART the dev server (NEXT_PUBLIC_* vars are ` +
      `read at start, not hot-reloaded).`
  );
}

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export async function apiFetch<T = unknown>(
  path: string, options: RequestInit = {}): Promise<T> {
  const token = getToken();
  // FormData bodies MUST NOT carry an explicit Content-Type: only the browser can
  // append the `; boundary=...` the server needs to parse the multipart payload.
  // Setting application/json here (or even multipart/form-data without a boundary)
  // makes the upload arrive unparseable.
  const isFormData =
    typeof FormData !== "undefined" && options.body instanceof FormData;
  const headers: Record<string, string> = {
    ...(isFormData ? {} : { "Content-Type": "application/json" }),
    // Skip ngrok's free-tier browser-warning interstitial. Without this, ngrok
    // returns an HTML warning page (with NO Access-Control-Allow-Origin header)
    // for browser-originated requests, which the browser surfaces as a CORS error.
    // Harmless on non-ngrok backends (they ignore the header).
    "ngrok-skip-browser-warning": "true",
    ...(options.headers as Record<string, string>),
  };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  const res = await fetch(`${API_BASE}${path}`, { ...options, headers });
  if (res.status === 401) {
    // Only force a logout/redirect when there was actually a session. On the
    // login page there's no token yet, so a 401 means bad credentials —
    // calling logout() (which does window.location.href) would reload the page
    // and wipe the inline error. Let the caller surface it instead.
    if (token) logout();
    throw new ApiError(401, "unauthorized");
  }
  if (!res.ok) throw new ApiError(res.status, await res.text());
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}