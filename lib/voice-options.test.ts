import { describe, it, expect } from "vitest";
import { voicesForEngine, isVoiceValid } from "./voice-options";

describe("voice options", () => {
  it("kokoro and piper have distinct voice sets", () => {
    expect(voicesForEngine("kokoro").length).toBeGreaterThan(0);
    expect(voicesForEngine("piper_urdu")).toContain("fasih");
  });
  it("rejects a kokoro voice when engine is piper", () => {
    expect(isVoiceValid("piper_urdu", "af_heart")).toBe(false);
    expect(isVoiceValid("piper_urdu", "fasih")).toBe(true);
  });
});
