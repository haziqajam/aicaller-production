const TOKEN_KEY = "aicaller_token";
const ROLE_KEY = "aicaller_role";

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
export function logout() {
  window.localStorage.removeItem(TOKEN_KEY);
  window.localStorage.removeItem(ROLE_KEY);
  document.cookie = `${TOKEN_KEY}=; path=/; max-age=0`;
  if (typeof window !== "undefined") window.location.href = "/login";
}
