import { describe, expect, it } from "vitest";

import { spokenCharCount, type Timings } from "./narration-timings";

/**
 * The word-highlighting clock. Its own docstring explains why it was pulled out
 * of the component: the effect that drives it runs in requestAnimationFrame,
 * which never fires in a hidden tab and so cannot be exercised from a browser
 * automation. That reasoning only pays off if something actually runs it.
 */

// "abcde", one character every 100ms.
const timings: Timings = {
  characters: ["a", "b", "c", "d", "e"],
  character_start_times_seconds: [0, 0.1, 0.2, 0.3, 0.4],
  character_end_times_seconds: [0.1, 0.2, 0.3, 0.4, 0.5],
};

describe("spokenCharCount", () => {
  it("counts nothing before the first character finishes", () => {
    expect(spokenCharCount(timings, 0)).toBe(0);
    expect(spokenCharCount(timings, 0.09)).toBe(0);
  });

  it("counts a character once its end time is reached", () => {
    // Boundary is inclusive: at exactly 0.1 the first character is done.
    expect(spokenCharCount(timings, 0.1)).toBe(1);
    expect(spokenCharCount(timings, 0.25)).toBe(2);
  });

  it("counts every character once the audio is past the end", () => {
    expect(spokenCharCount(timings, 0.5)).toBe(5);
    expect(spokenCharCount(timings, 99)).toBe(5);
  });

  it("goes back down when the listener scrubs backwards", () => {
    // The reason it rescans instead of advancing a cursor. A cursor-based
    // version returns 4 here and the highlight sticks at the wrong word.
    expect(spokenCharCount(timings, 0.4)).toBe(4);
    expect(spokenCharCount(timings, 0.2)).toBe(2);
    expect(spokenCharCount(timings, 0)).toBe(0);
  });

  it("survives a negative time", () => {
    // Audio elements can report small negative currentTime while seeking.
    expect(spokenCharCount(timings, -1)).toBe(0);
  });

  it("returns 0 for empty timings rather than throwing", () => {
    const empty: Timings = {
      characters: [],
      character_start_times_seconds: [],
      character_end_times_seconds: [],
    };
    expect(spokenCharCount(empty, 1)).toBe(0);
  });
});
