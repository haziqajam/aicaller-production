import { describe, it, expect } from "vitest";
import {
  assistantSchema, ttsConfig, endCallConfig, toolSchema, leadListSchema, campaignSchema,
  analysisQuestionSchema,
} from "./schemas";

describe("POA schema foundations", () => {
  it("assistant defaults include new fields", () => {
    const a = assistantSchema.parse({ name: "a", systemPrompt: "p" });
    expect(a.toolIds).toEqual([]);
    expect(a.vad.responsiveness).toBe("balanced");
    expect(a.tts.speed).toBe(1);
    expect(a.endCall.endCallPhrases).toEqual([]);
  });
  it("tts speed is bounded", () => {
    expect(ttsConfig.parse({}).speed).toBe(1);
    expect(ttsConfig.safeParse({ speed: 3 }).success).toBe(false);
  });
  it("endCall phrases default empty", () => {
    expect(endCallConfig.parse({}).endCallPhrases).toEqual([]);
  });
  it("tool name rejects spaces, accepts valid", () => {
    expect(toolSchema.safeParse({ name: "bad name", url: "https://e.com" }).success).toBe(false);
    expect(toolSchema.safeParse({ name: "get_x", url: "https://e.com" }).success).toBe(true);
  });
  it("lead list requires a name", () => {
    expect(leadListSchema.safeParse({}).success).toBe(false);
  });
  it("campaign concurrency capped at 5, accepts listId", () => {
    expect(campaignSchema.safeParse({ assistantId: "a", fromNumber: "+1", concurrency: 6 }).success).toBe(false);
    expect(campaignSchema.parse({ assistantId: "a", fromNumber: "+1", listId: "x" }).listId).toBe("x");
  });
  it("analysis question defaults to boolean (back-compat) and accepts typed", () => {
    // Legacy {text} → boolean.
    expect(analysisQuestionSchema.parse({ text: "Mentioned Stripe?" }).type).toBe("boolean");
    expect(analysisQuestionSchema.parse({ text: "Summary?", type: "descriptive" }).type).toBe("descriptive");
    expect(analysisQuestionSchema.safeParse({ text: "x", type: "bogus" }).success).toBe(false);
  });
});
