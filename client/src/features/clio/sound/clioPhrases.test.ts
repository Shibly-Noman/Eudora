import { describe, expect, it } from "vitest";

import { getRandomClioPhrase, normalizeMathForSpeech } from "./clioPhrases";
import { CLIO_PHRASES, CLIO_SPOKEN_LINES, CLIO_VOICE_LINES } from "./clioPhrases.generated";

/**
 * Clio's phrase catalog and the text normaliser in front of it.
 *
 * The lookup is an exact string match, which is the whole reason the demo spent
 * months reading in the browser's voice: the "Listen" buttons passed a joined
 * "intro + prompt" string, and a joined string can never be a key. Nothing
 * failed — the voice just changed. These lock down the shape that makes a
 * miss possible.
 */

describe("CLIO_SPOKEN_LINES", () => {
  it("keys every line on its own exact text", () => {
    for (const [text, file] of Object.entries(CLIO_SPOKEN_LINES)) {
      expect(text.trim()).toBe(text);
      expect(file).toMatch(/^\/clio-voice\/line-[0-9a-f]{12}\.mp3$/);
    }
  });

  it("does not match a concatenation of two of its own keys", () => {
    // The exact failure that shipped. If a future change makes joined lookups
    // "work" by fuzzy matching, that is a silent behaviour change, not a fix.
    const keys = Object.keys(CLIO_SPOKEN_LINES);
    expect(keys.length).toBeGreaterThan(1);
    const joined = `${keys[0]} ${keys[1]}`;
    expect(CLIO_SPOKEN_LINES[joined]).toBeUndefined();
  });

  it("gives each phrase key one audio file per written variant", () => {
    for (const key of Object.keys(CLIO_PHRASES) as (keyof typeof CLIO_PHRASES)[]) {
      // Index-aligned by contract: variant N of a key is voice line N, and the
      // service picks one index for both.
      expect(CLIO_VOICE_LINES[key].length).toBe(CLIO_PHRASES[key].length);
    }
  });
});

describe("getRandomClioPhrase", () => {
  it("only ever returns a phrase from the requested key", () => {
    for (let i = 0; i < 50; i++) {
      expect(CLIO_PHRASES.CORRECT).toContain(getRandomClioPhrase("CORRECT"));
    }
  });
});

describe("normalizeMathForSpeech", () => {
  it("reads operators as words", () => {
    expect(normalizeMathForSpeech("2 + 3 = 5")).toBe("2 plus 3 equals 5");
    expect(normalizeMathForSpeech("3 × 4")).toBe("3 times 4");
    expect(normalizeMathForSpeech("8 ÷ 2")).toBe("8 divided by 2");
    expect(normalizeMathForSpeech("30%")).toBe("30 percent");
  });

  it("strips markup that would otherwise be read aloud", () => {
    expect(normalizeMathForSpeech("**bold** and *italic*")).toBe("bold and italic");
    expect(normalizeMathForSpeech("$x$")).toBe("x");
  });

  it("collapses the whitespace its own substitutions create", () => {
    // Each operator is replaced with a space-padded word, so without the final
    // collapse this returns doubled spaces.
    expect(normalizeMathForSpeech("1+2")).toBe("1 plus 2");
    expect(normalizeMathForSpeech("  spaced   out  ")).toBe("spaced out");
  });

  it("returns empty string for empty input rather than throwing", () => {
    expect(normalizeMathForSpeech("")).toBe("");
  });
});
