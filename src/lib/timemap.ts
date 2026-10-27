// TypeScript port of backend/packages/core/src/core/timemap.py. Both run core/vectors/timemap.json.
// Source time and output time are different clocks: convert only through srcToOut and outToSrc.
import type { EDL, Transition } from "@/api/types";

export interface SegmentTiming {
  index: number;
  id: string;
  tOutStart: number;
  tOutEnd: number;
  srcStart: number;
  srcEnd: number;
}

const DEFAULT_TRANSITION: Transition = { type: "fade", duration_s: 0.4 };

export function effectiveDuration(t: Transition): number {
  return t.type === "cut" ? 0 : t.duration_s;
}

/** Transition between segments[i] and segments[i + 1]: an override naming them, else the default. */
export function boundary(edl: EDL, i: number): Transition {
  const a = edl.segments[i].id;
  const b = edl.segments[i + 1].id;
  const o = edl.transitions?.overrides?.find((x) => x.from === a && x.to === b);
  if (o) return { type: o.type, duration_s: o.duration_s };
  return edl.transitions?.default ?? DEFAULT_TRANSITION;
}

export function boundaries(edl: EDL): Transition[] {
  return edl.segments.slice(0, -1).map((_, i) => boundary(edl, i));
}

export function boundaryDurations(edl: EDL): number[] {
  return boundaries(edl).map(effectiveDuration);
}

export function segmentTimings(edl: EDL): SegmentTiming[] {
  const d = boundaryDurations(edl);
  const out: SegmentTiming[] = [];
  let t = 0;
  edl.segments.forEach((s, i) => {
    const len = s.src_end - s.src_start;
    out.push({ index: i, id: s.id, tOutStart: t, tOutEnd: t + len, srcStart: s.src_start, srcEnd: s.src_end });
    if (i < d.length) t += len - d[i];
  });
  return out;
}

export function outputDuration(edl: EDL): number {
  const lens = edl.segments.reduce((acc, s) => acc + (s.src_end - s.src_start), 0);
  return lens - boundaryDurations(edl).reduce((a, b) => a + b, 0);
}

export function srcToOut(edl: EDL, srcTime: number, timings = segmentTimings(edl)): number | null {
  for (const st of timings) {
    if (st.srcStart <= srcTime && srcTime < st.srcEnd) return st.tOutStart + (srcTime - st.srcStart);
  }
  return null;
}

/** [segment index, source time] for every segment playing at tOut: two inside a transition overlap. */
export function outToSrc(edl: EDL, tOut: number, timings = segmentTimings(edl)): [number, number][] {
  return timings
    .filter((st) => st.tOutStart <= tOut && tOut < st.tOutEnd)
    .map((st) => [st.index, st.srcStart + (tOut - st.tOutStart)]);
}
