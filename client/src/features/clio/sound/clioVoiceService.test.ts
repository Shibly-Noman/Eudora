import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { CLIO_SPOKEN_LINES } from "./clioPhrases.generated";
import { clioVoice } from "./clioVoiceService";

/**
 * Playback routing: recorded voice where one exists, synthesiser only where one
 * cannot. This is the seam the demo's "Listen" buttons fell through — they
 * passed a joined string, missed the lookup, and spoke in the browser's voice
 * for months without anything failing.
 */

const recordedLines = Object.keys(CLIO_SPOKEN_LINES);

/** Stands in for HTMLAudioElement, and lets a test end a line on demand. */
class FakeAudio {
  static created: FakeAudio[] = [];
  onended: (() => void) | null = null;
  onerror: (() => void) | null = null;
  currentTime = 0;
  paused = false;

  constructor(public src: string) {
    FakeAudio.created.push(this);
  }
  play() {
    return Promise.resolve();
  }
  pause() {
    this.paused = true;
  }
  /** What the real element does when the clip finishes. */
  finish() {
    this.onended?.();
  }
}

let speakSpy: ReturnType<typeof vi.fn>;

beforeEach(() => {
  FakeAudio.created = [];
  vi.stubGlobal("Audio", FakeAudio as unknown as typeof Audio);

  speakSpy = vi.fn();
  // jsdom ships neither of these; the service constructs an utterance before
  // handing it to speak().
  vi.stubGlobal(
    "SpeechSynthesisUtterance",
    class {
      voice: unknown = null;
      rate = 1;
      pitch = 1;
      volume = 1;
      lang = "";
      onstart: (() => void) | null = null;
      onend: (() => void) | null = null;
      onerror: (() => void) | null = null;
      constructor(public text: string) {}
    },
  );
  vi.stubGlobal("speechSynthesis", {
    speak: speakSpy,
    cancel: vi.fn(),
    resume: vi.fn(),
    getVoices: () => [],
    paused: false,
    speaking: false,
  });

  clioVoice.setMuted(false);
});

afterEach(() => {
  clioVoice.stop();
  vi.unstubAllGlobals();
});

describe("speakText", () => {
  it("plays the recording for a line that has one", () => {
    const line = recordedLines[0];
    expect(clioVoice.speakText(line)).toBe(true);
    expect(FakeAudio.created.map((a) => a.src)).toEqual([CLIO_SPOKEN_LINES[line]]);
    expect(speakSpy).not.toHaveBeenCalled();
  });

  it("falls back to the synthesiser only when no recording exists", () => {
    clioVoice.speakText("a line nobody ever recorded");
    expect(FakeAudio.created).toHaveLength(0);
    expect(speakSpy).toHaveBeenCalledTimes(1);
  });

  it("misses the lookup when two recorded lines are joined", () => {
    // The shipped bug, reproduced. Joining is what the Listen buttons did.
    clioVoice.speakText(`${recordedLines[0]} ${recordedLines[1]}`);
    expect(FakeAudio.created).toHaveLength(0);
    expect(speakSpy).toHaveBeenCalledTimes(1);
  });

  it("stays silent when muted", () => {
    clioVoice.setMuted(true);
    expect(clioVoice.speakText(recordedLines[0])).toBe(false);
    expect(FakeAudio.created).toHaveLength(0);
    expect(speakSpy).not.toHaveBeenCalled();
    clioVoice.setMuted(false);
  });
});

describe("speakLines", () => {
  it("plays each line's own recording, never a joined one", () => {
    clioVoice.speakLines([recordedLines[0], recordedLines[1]]);
    // Only the first starts immediately; the second waits for it to end.
    expect(FakeAudio.created.map((a) => a.src)).toEqual([CLIO_SPOKEN_LINES[recordedLines[0]]]);
    expect(speakSpy).not.toHaveBeenCalled();
  });

  it("starts the next line when the previous one ends", () => {
    clioVoice.speakLines([recordedLines[0], recordedLines[1]]);
    FakeAudio.created[0].finish();
    expect(FakeAudio.created.map((a) => a.src)).toEqual([
      CLIO_SPOKEN_LINES[recordedLines[0]],
      CLIO_SPOKEN_LINES[recordedLines[1]],
    ]);
  });

  it("honours interrupt:false so it does not cut off a phrase already playing", () => {
    // The auto-play path fires playPhrase("INCORRECT") and then the hint with
    // interrupt:false. If the first line of a sequence interrupted anyway, the
    // phrase would be cut off mid-word. stop() is what would do the cutting.
    const cancel = (globalThis.speechSynthesis as unknown as { cancel: ReturnType<typeof vi.fn> })
      .cancel;
    clioVoice.speakLines([recordedLines[0], recordedLines[1]], { interrupt: false });
    expect(cancel).not.toHaveBeenCalled();
  });

  it("interrupts on the first line by default", () => {
    const cancel = (globalThis.speechSynthesis as unknown as { cancel: ReturnType<typeof vi.fn> })
      .cancel;
    clioVoice.speakLines([recordedLines[0], recordedLines[1]]);
    expect(cancel).toHaveBeenCalledTimes(1);
    // ...and exactly once: the handover to line two must not re-interrupt.
    FakeAudio.created[0].finish();
    expect(cancel).toHaveBeenCalledTimes(1);
  });

  it("calls onEnd once, after the last line", () => {
    const onEnd = vi.fn();
    clioVoice.speakLines([recordedLines[0], recordedLines[1]], { onEnd });
    FakeAudio.created[0].finish();
    expect(onEnd).not.toHaveBeenCalled();
    FakeAudio.created[1].finish();
    expect(onEnd).toHaveBeenCalledTimes(1);
  });

  it("ignores blank entries instead of speaking silence", () => {
    clioVoice.speakLines(["", "   ", recordedLines[0]]);
    expect(FakeAudio.created.map((a) => a.src)).toEqual([CLIO_SPOKEN_LINES[recordedLines[0]]]);
  });

  it("returns false for nothing to say", () => {
    expect(clioVoice.speakLines([])).toBe(false);
    expect(clioVoice.speakLines(["", "  "])).toBe(false);
  });
});
