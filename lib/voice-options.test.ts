import { describe, it, expect } from "vitest";
import {
  voicesForEngine,
  isVoiceValid,
  hasDynamicVoices,
  voiceOptionsFromVoices,
  voiceOptionsForEngine,
  slugifyVoiceName,
  transcriptCoverageWarning,
  VOICE_NAME_RE,
} from "./voice-options";
import type { TtsEngineInfo } from "./api/catalog";
import type { Voice } from "./api/resources";

const voice = (over: Partial<Voice> = {}): Voice => ({
  id: "1",
  name: "sophie",
  displayName: "Sophie",
  engine: "neutts",
  source: "builtin",
  status: "ready",
  error: null,
  createdAt: null,
  ...over,
});

const NEUTTS: TtsEngineInfo = {
  id: "neutts",
  label: "NeuTTS Nano (Local)",
  type: "self-hosted",
  voices: [],
  dynamicVoices: true,
};
const KOKORO: TtsEngineInfo = {
  id: "kokoro",
  label: "English (Local)",
  type: "self-hosted",
  voices: ["af_heart", "af_bella"],
};

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

describe("dynamic voice engines", () => {
  it("flags neutts from the catalog's dynamicVoices", () => {
    expect(hasDynamicVoices([NEUTTS, KOKORO], "neutts")).toBe(true);
    expect(hasDynamicVoices([NEUTTS, KOKORO], "kokoro")).toBe(false);
  });

  it("still treats neutts as dynamic against a backend that predates the flag", () => {
    expect(hasDynamicVoices([{ ...NEUTTS, dynamicVoices: undefined }], "neutts"))
      .toBe(true);
    expect(hasDynamicVoices(undefined, "neutts")).toBe(true);
  });

  it("never invents a static neutts voice list", () => {
    // A hardcoded fallback would name voices that may not exist for this tenant.
    expect(voicesForEngine("neutts")).toEqual([]);
  });
});

describe("voiceOptionsFromVoices", () => {
  it("makes ready voices selectable, labelled by displayName", () => {
    expect(voiceOptionsFromVoices([voice()])).toEqual([
      { value: "sophie", label: "Sophie", disabled: false },
    ]);
  });

  it("lists an encoding clone as disabled rather than hiding it", () => {
    // Hiding it makes a fresh upload look lost for the ~20s the encode takes.
    const [opt] = voiceOptionsFromVoices([
      voice({ name: "mine", displayName: "My Voice", status: "encoding", source: "cloned" }),
    ]);
    expect(opt).toEqual({
      value: "mine",
      label: "My Voice (processing…)",
      disabled: true,
    });
  });

  it("marks a failed clone as failed and unselectable", () => {
    const [opt] = voiceOptionsFromVoices([
      voice({ name: "bad", displayName: "Bad", status: "failed", source: "cloned" }),
    ]);
    expect(opt.label).toBe("Bad (failed)");
    expect(opt.disabled).toBe(true);
  });

  it("handles the not-yet-loaded case", () => {
    expect(voiceOptionsFromVoices(undefined)).toEqual([]);
  });
});

describe("voiceOptionsForEngine", () => {
  it("reads dynamic engines from the /voices rows, not the catalog", () => {
    const opts = voiceOptionsForEngine([NEUTTS], "neutts", {
      voices: [voice(), voice({ id: "2", name: "paul", displayName: "Paul" })],
    });
    expect(opts.map((o) => o.value)).toEqual(["sophie", "paul"]);
  });

  it("reads fixed engines from the catalog list", () => {
    const opts = voiceOptionsForEngine([KOKORO], "kokoro", {});
    expect(opts).toEqual([
      { value: "af_heart", label: "af_heart", disabled: false },
      { value: "af_bella", label: "af_bella", disabled: false },
    ]);
  });

  it("falls back to the runtime catalog when the backend catalog is empty", () => {
    const opts = voiceOptionsForEngine(undefined, "kokoro", {
      runtimeCatalog: { kokoro: ["af_sky"] },
    });
    expect(opts.map((o) => o.value)).toEqual(["af_sky"]);
  });

  it("returns an empty list for a dynamic engine whose rows have not arrived", () => {
    expect(voiceOptionsForEngine([NEUTTS], "neutts", {})).toEqual([]);
  });
});

describe("voice cloning helpers", () => {
  it("derives an identifier from a display name the way the server does", () => {
    expect(slugifyVoiceName("Client A — Male #1")).toBe("client_a_male_1");
    expect(slugifyVoiceName("  Sara's Voice  ")).toBe("sara_s_voice");
    expect(slugifyVoiceName("x".repeat(60))).toHaveLength(40);
  });

  it("produces identifiers the server's rule accepts", () => {
    for (const raw of ["Client A — Male", "Émilie 2", "voice__name"]) {
      const slug = slugifyVoiceName(raw);
      // An empty slug is a legitimate outcome (all-punctuation input); the form
      // surfaces that as "invalid identifier" rather than sending it.
      if (slug) expect(VOICE_NAME_RE.test(slug)).toBe(true);
    }
  });

  it("rejects identifiers the server would reject", () => {
    for (const bad of ["Upper", "with space", "a/b", "../escape", "x".repeat(41), ""]) {
      expect(VOICE_NAME_RE.test(bad)).toBe(false);
    }
  });

  it("flags a transcript that cannot cover the clip", () => {
    // The silent-failure case: NeuTTS aligns reference text to reference audio,
    // so a 2-word transcript over 10s yields a wrong clone with no error.
    expect(transcriptCoverageWarning("hello there", 10)).toMatch(/too slow/);
  });

  it("flags a transcript that describes more than the clip", () => {
    const long = Array.from({ length: 60 }, () => "word").join(" ");
    expect(transcriptCoverageWarning(long, 5)).toMatch(/too fast/);
  });

  it("stays quiet for a plausible speaking rate", () => {
    // 15 words over 6s = 150 wpm — normal conversational English.
    const text = Array.from({ length: 15 }, () => "word").join(" ");
    expect(transcriptCoverageWarning(text, 6)).toBeNull();
  });

  it("says nothing when the duration is unknown", () => {
    // An unmeasurable clip must not produce a bogus warning.
    expect(transcriptCoverageWarning("hello there", null)).toBeNull();
    expect(transcriptCoverageWarning("hello there", 0)).toBeNull();
  });
});
