const TOKEN_KEY = "jerali_token";
const ROLE_KEY = "jerali_role";

export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(TOKEN_KEY);
}
export function getRole(): "user" | "admin" | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(ROLE_KEY) as "user" | "admin" | null;
}
export function setSession(token: string, role: string) {
  window.localStorage.setItem(TOKEN_KEY, token);
  window.localStorage.setItem(ROLE_KEY, role);
  document.cookie = `${TOKEN_KEY}=${token}; path=/; samesite=lax`;
}
/** Clear the session WITHOUT navigating. Both stores must go together: the
 *  proxy trusts the COOKIE while apiFetch sends the LOCALSTORAGE token — if
 *  they ever disagree (stale cookie + expired token) the proxy bounces /login
 *  → / and the 401 bounces / → /login, i.e. a "constantly refreshing" loop. */
export function clearSession() {
  window.localStorage.removeItem(TOKEN_KEY);
  window.localStorage.removeItem(ROLE_KEY);
  document.cookie = `${TOKEN_KEY}=; path=/; max-age=0`;
}

export function logout() {
  clearSession();
  // Never reload a login page we're already on — concurrent 401s (several
  // queries failing at once, or polling refetches) would otherwise each force
  // a redundant full reload of /login.
  if (typeof window !== "undefined" &&
      !window.location.pathname.startsWith("/login")) {
    window.location.href = "/login";
  }
}
