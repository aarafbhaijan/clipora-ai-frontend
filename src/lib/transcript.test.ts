import { describe, expect, it } from "vitest";
import { cueAt, snapTo, toSrt } from "./transcript";

describe("transcript helpers", () => {
  const cues = [
    { id: "c1", start: 0, end: 1.2, text: "Hello there", words: [{ text: "Hello", start: 0, end: 0.5 }] },
    { id: "c2", start: 1.2, end: 2.5, text: "Next", words: [] },
  ];
  it("snaps within the window only", () => {
    expect(snapTo(0.4, [0, 0.5, 1.2], 0.15)).toBe(0.5);
    expect(snapTo(0.8, [0, 0.5, 1.2], 0.15)).toBe(0.8);
  });
  it("finds the cue at a time", () => {
    expect(cueAt(cues, 1.3)?.id).toBe("c2");
    expect(cueAt(cues, 3)).toBeUndefined();
  });
  it("writes SRT like core.transcript.to_srt", () => {
    expect(toSrt([cues[0]], { c1: "Hi" })).toBe("1\n00:00:00,000 --> 00:00:01,200\nHi\n");
  });
});
