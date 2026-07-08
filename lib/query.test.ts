import { describe, it, expect } from "vitest";
import { POLL } from "./query";

describe("polling presets", () => {
  it("live screens poll fast, others are off", () => {
    expect(POLL.live).toBeLessThanOrEqual(5000);
    expect(POLL.live).toBeGreaterThan(0);
    expect(POLL.off).toBe(false);
  });
});
