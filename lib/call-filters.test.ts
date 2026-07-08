import { describe, it, expect } from "vitest";
import { buildCallQuery } from "./call-filters";

describe("buildCallQuery", () => {
  it("omits direction when 'all'", () => {
    expect(buildCallQuery({ direction: "all" })).toBe("");
  });
  it("includes direction for inbound/outbound", () => {
    expect(buildCallQuery({ direction: "outbound" })).toBe("?direction=outbound");
  });
});
