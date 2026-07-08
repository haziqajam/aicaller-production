import { describe, it, expect } from "vitest";
import { pacingSummary } from "./pacing";

describe("pacingSummary", () => {
  it("describes the run in plain language", () => {
    const s = pacingSummary({ leadCount: 1240, fromNumber: "+15551112222",
      assistantName: "Sales-Bot", concurrency: 5, delayBetweenCalls: 3,
      maxCallDuration: 900 });
    expect(s).toContain("1,240 leads");
    expect(s).toContain("Sales-Bot");
    expect(s).toContain("5 concurrent");
    expect(s).toContain("3s apart");
    expect(s).toContain("15-min cap");
  });
});
