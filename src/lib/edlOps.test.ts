import { produce } from "immer";
import { describe, expect, it } from "vitest";
import type { EDL } from "@/api/types";
import { addSegment, moveSegment, removeSegment, setTransition, splitAt, trimSegment } from "./edlOps";
import { boundary, outputDuration } from "./timemap";

const base: EDL = {
  version: 1,
  audio_fade_ms: 80,
  source: { key: "k", duration_s: 100, width: 1920, height: 1080, fps: 30 },
  output: { aspect: "9:16", width: 1080, height: 1920, fps: 30, framing: "crop" },
  segments: [
    { id: "s1", src_start: 10, src_end: 20 },
    { id: "s2", src_start: 30, src_end: 40 },
  ],
  transitions: { default: { type: "fade", duration_s: 0.5 }, overrides: [{ from: "s1", to: "s2", type: "cut", duration_s: 0.4 }] },
};

describe("edl ops", () => {
  it("trims within limits", () => {
    const e = produce(base, (d) => trimSegment(d, "s1", { src_end: 10.2 }));
    expect(e.segments[0].src_end).toBe(11);
  });
  it("prunes overrides after reorder and remove", () => {
    expect(produce(base, (d) => moveSegment(d, "s2", 0)).transitions?.overrides).toEqual([]);
    expect(produce(base, (d) => removeSegment(d, "s1")).segments.map((s) => s.id)).toEqual(["s2"]);
  });
  it("adds with a fresh id", () => {
    const e = produce(base, (d) => void addSegment(d, 50, 55, 1));
    expect(e.segments.map((s) => s.id)).toEqual(["s1", "s3", "s2"]);
  });
  it("splits with a cut between halves", () => {
    const e = produce(base, (d) => void splitAt(d, 5));
    expect(e.segments.map((s) => [s.id, s.src_start, s.src_end])).toEqual([
      ["s1", 10, 15],
      ["s3", 15, 20],
      ["s2", 30, 40],
    ]);
    expect(boundary(e, 0).type).toBe("cut");
    expect(outputDuration(e)).toBe(20);
  });
  it("sets one transition or all", () => {
    const one = produce(base, (d) => setTransition(d, { from: "s1", to: "s2" }, "wipe_left", 0.6));
    expect(boundary(one, 0)).toEqual({ type: "wipe_left", duration_s: 0.6 });
    const all = produce(base, (d) => setTransition(d, { all: true }, "dip_black", 0.3));
    expect(all.transitions?.overrides).toEqual([]);
    expect(boundary(all, 0).type).toBe("dip_black");
  });
});
