import { describe, it, expect } from "vitest";
import { resolveRedirect } from "./guard";

describe("resolveRedirect", () => {
  it("sends anonymous users to /login", () => {
    expect(resolveRedirect({ path: "/", hasToken: false, role: null })).toBe("/login");
  });
  it("keeps logged-in users on app pages", () => {
    expect(resolveRedirect({ path: "/assistants", hasToken: true, role: "user" })).toBeNull();
  });
  it("blocks non-admins from /admin", () => {
    expect(resolveRedirect({ path: "/admin/users", hasToken: true, role: "user" })).toBe("/");
  });
  it("redirects logged-in users away from /login", () => {
    expect(resolveRedirect({ path: "/login", hasToken: true, role: "user" })).toBe("/");
  });
});
