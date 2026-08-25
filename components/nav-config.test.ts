import { describe, it, expect } from "vitest";
import { NAV_GROUPS, visibleGroups } from "./nav-config";

describe("nav", () => {
  it("groups by workflow Build/Run/VICIdial/Settings/Admin", () => {
    expect(NAV_GROUPS.map((g) => g.label)).toEqual(
      ["Overview", "Build", "Run", "VICIdial", "VICIdial admin",
       "Settings", "Admin"]);
  });
  it("hides admin-only groups from non-admins", () => {
    for (const label of ["Admin", "VICIdial admin"]) {
      expect(visibleGroups("user").some((g) => g.label === label)).toBe(false);
      expect(visibleGroups("admin").some((g) => g.label === label)).toBe(true);
    }
  });
});
