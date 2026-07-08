// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import { apiFetch, ApiError } from "./client";
import * as auth from "@/lib/auth";

describe("apiFetch", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("injects the bearer token", async () => {
    vi.spyOn(auth, "getToken").mockReturnValue("tok123");
    const fetchSpy = vi.spyOn(global, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), { status: 200 }));
    await apiFetch("/assistants");
    const headers = (fetchSpy.mock.calls[0][1] as RequestInit).headers as Record<string, string>;
    expect(headers["Authorization"]).toBe("Bearer tok123");
  });

  it("throws ApiError and logs out on 401 when a session token exists", async () => {
    vi.spyOn(auth, "getToken").mockReturnValue("tok123");
    const logout = vi.spyOn(auth, "logout").mockImplementation(() => {});
    vi.spyOn(global, "fetch").mockResolvedValue(new Response("nope", { status: 401 }));
    await expect(apiFetch("/assistants")).rejects.toBeInstanceOf(ApiError);
    expect(logout).toHaveBeenCalled();
  });

  it("does NOT log out on 401 when there is no session (e.g. login failure)", async () => {
    // No token → the 401 is a bad-credentials response on the login page, not an
    // expired session. logout() (which reloads the page) must not fire, or it
    // would wipe the inline error before the user sees it.
    vi.spyOn(auth, "getToken").mockReturnValue(null);
    const logout = vi.spyOn(auth, "logout").mockImplementation(() => {});
    vi.spyOn(global, "fetch").mockResolvedValue(new Response("bad", { status: 401 }));
    await expect(apiFetch("/auth/login", { method: "POST" })).rejects.toBeInstanceOf(ApiError);
    expect(logout).not.toHaveBeenCalled();
  });
});
