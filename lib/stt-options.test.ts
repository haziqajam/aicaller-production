import { describe, it, expect } from "vitest";
import { sttConfig } from "./api/schemas";

/**
 * The sherpa-onnx engine ids must parse. This schema validates every assistant
 * the editor LOADS, so an id missing here is rejected client-side even after the
 * backend accepted the save — the exact failure mode that kept neutts invisible.
 */
describe("stt engine schema", () => {
  it.each(["moonshine-base", "parakeet-v2", "parakeet-v3"])(
    "accepts %s",
    (engine) => {
      const parsed = sttConfig.parse({ engine, language: "en" });
      expect(parsed.engine).toBe(engine);
    }
  );

  it("keeps the existing engines working", () => {
    for (const engine of ["deepgram", "openai", "asrtest", "whisper_local"]) {
      expect(sttConfig.parse({ engine }).engine).toBe(engine);
    }
  });

  it("still rejects an unknown engine", () => {
    expect(() => sttConfig.parse({ engine: "not-an-engine" })).toThrow();
  });

  it("allows a null model for the fixed-model engines", () => {
    // The sherpa bundles are one model each — no size sub-option to persist.
    expect(sttConfig.parse({ engine: "parakeet-v2", model: null }).model).toBeNull();
  });
});
