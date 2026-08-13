import { describe, it, expect } from "vitest";
import {
  accentConfig, assistantSchema, transferConfig, DEFAULT_ACCENT,
} from "./api/schemas";

/**
 * v2: accent is a PER-OWNER config served by GET/PUT /accent-config, not a field
 * on an assistant. These pin the standalone schema the settings page round-trips,
 * plus the backward-compat parse of a v1 assistant document.
 */
describe("accent config schema (v2, standalone)", () => {
  it("defaults to OFF with a CPU-first placement", () => {
    const c = accentConfig.parse({});
    expect(c.enabled).toBe(false);
    expect(c.ttsEngine).toBe("kokoro");
    expect(c.voice).toBe("af_heart");
    // v2 runs the relay on its own pod, so CPU is the cheap default.
    expect(c.preferCpu).toBe(true);
  });

  it("round-trips what the settings page sends", () => {
    const c = accentConfig.parse({
      enabled: true, ttsEngine: "neutts", voice: "sophie", preferCpu: false,
    });
    expect(c).toMatchObject({
      enabled: true, ttsEngine: "neutts", voice: "sophie", preferCpu: false,
    });
  });

  it("keeps the tuning fields the page does not surface", () => {
    const c = accentConfig.parse({ stopMs: 250, sttEngine: "parakeet-v3" });
    expect(c.stopMs).toBe(250);
    expect(c.sttEngine).toBe("parakeet-v3");
  });

  it("rejects an engine the backend would 422", () => {
    expect(() => accentConfig.parse({ ttsEngine: "elevenlabs" })).toThrow();
  });
});

describe("v1 backward compatibility", () => {
  it("still parses a v1 assistant that carries transfer.accent", () => {
    const a = assistantSchema.parse({ name: "x", systemPrompt: "y" });
    expect(a.transfer.accent.enabled).toBe(false);
    expect(a.transfer.accent.ttsEngine).toBe("kokoro");
    expect(a.transfer.accent.voice).toBe("af_heart");
    // v1 field retained so an old document does not fail to parse.
    expect(a.transfer.accent.requireGpu).toBe(true);
  });

  it("round-trips an enabled accent config", () => {
    // Exactly the shape the backend reads: transfer.accent.*
    const parsed = assistantSchema.parse({
      name: "x",
      systemPrompt: "y",
      transfer: {
        enabled: true,
        accent: { enabled: true, ttsEngine: "neutts", voice: "sophie" },
      },
    });
    expect(parsed.transfer.accent).toMatchObject({
      enabled: true,
      ttsEngine: "neutts",
      voice: "sophie",
    });
  });

  it("keeps an assistant saved before this feature parseable", () => {
    // A doc with a transfer block and NO accent key at all.
    const parsed = assistantSchema.parse({
      name: "x",
      systemPrompt: "y",
      transfer: { enabled: true, announcement: "hold", targets: [] },
    });
    expect(parsed.transfer.accent.enabled).toBe(false);
  });

  it("preserves the fields the editor does not surface", () => {
    // requireGpu must survive a save from a UI that never shows it — otherwise
    // saving would silently flip an accent call onto CPU pods.
    const parsed = transferConfig.parse({
      enabled: true,
      accent: { enabled: true, requireGpu: false, stopMs: 250,
                sttEngine: "parakeet-v3" },
    });
    expect(parsed.accent.requireGpu).toBe(false);
    expect(parsed.accent.stopMs).toBe(250);
    expect(parsed.accent.sttEngine).toBe("parakeet-v3");
  });

  it("rejects an engine the backend would 422", () => {
    expect(() =>
      transferConfig.parse({ accent: { ttsEngine: "elevenlabs" } })
    ).toThrow();
  });

  it("exposes one source of truth for the page-level defaults", () => {
    expect(DEFAULT_ACCENT).toEqual(
      assistantSchema.parse({ name: "x", systemPrompt: "y" }).transfer.accent
    );
  });
});
