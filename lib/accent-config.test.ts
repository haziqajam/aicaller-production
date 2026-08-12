import { describe, it, expect } from "vitest";
import { assistantSchema, transferConfig, DEFAULT_ACCENT } from "./api/schemas";

/**
 * The accent block must round-trip through the editor's schema. The STT dropdown
 * work is the cautionary tale: a field missing from the zod schema is silently
 * dropped on save even when the backend accepts it.
 */
describe("accent config schema", () => {
  it("defaults to OFF so existing assistants are unaffected", () => {
    const a = assistantSchema.parse({ name: "x", systemPrompt: "y" });
    expect(a.transfer.accent.enabled).toBe(false);
    expect(a.transfer.accent.ttsEngine).toBe("kokoro");
    expect(a.transfer.accent.voice).toBe("af_heart");
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
