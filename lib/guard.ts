export function resolveRedirect(input: {
  path: string; hasToken: boolean; role: "user" | "admin" | null;
}): string | null {
  const { path, hasToken, role } = input;
  if (path === "/login") return hasToken ? "/" : null;
  if (!hasToken) return "/login";
  if (path.startsWith("/admin") && role !== "admin") return "/";
  return null;
}
