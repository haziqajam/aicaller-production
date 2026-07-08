import { describe, it, expect } from "vitest";
import { parseLeadsCsv } from "./csv";

describe("parseLeadsCsv", () => {
  it("parses name/phone rows and skips header", () => {
    const rows = parseLeadsCsv("name,phone\nJoe,+15550001\nAmy,+15550002");
    expect(rows).toEqual([
      { name: "Joe", phone: "+15550001" },
      { name: "Amy", phone: "+15550002" },
    ]);
  });
  it("ignores blank lines", () => {
    expect(parseLeadsCsv("name,phone\n\nJoe,+1\n").length).toBe(1);
  });
});
