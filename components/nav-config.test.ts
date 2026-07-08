import { describe, it, expect } from "vitest";
import { NAV_GROUPS, visibleGroups } from "./nav-config";

describe("nav", () => {
  it("groups by workflow Build/Run/Settings/Admin", () => {
    expect(NAV_GROUPS.map((g) => g.label)).toEqual(
      ["Overview", "Build", "Run", "Settings", "Admin"]);
  });
  it("hides Admin group from non-admins", () => {
    expect(visibleGroups("user").some((g) => g.label === "Admin")).toBe(false);
    expect(visibleGroups("admin").some((g) => g.label === "Admin")).toBe(true);
  });
});
