// Pure edits on a plan (used inside immer recipes). The server validates and recomputes crops on save.
import type { EDL, Framing, Segment, TransitionType } from "@/api/types";
import { outToSrc } from "./timemap";

export const MIN_SEGMENT_S = 1.0;
export const MAX_SEGMENTS = 30;

export function nextSegmentId(edl: EDL): string {
  const max = edl.segments.reduce((m, s) => Math.max(m, Number(s.id.slice(1)) || 0), 0);
  return `s${max + 1}`;
}

function index(edl: EDL, id: string): number {
  return edl.segments.findIndex((s) => s.id === id);
}

/** Drop overrides that no longer name adjacent segments (after remove or reorder). */
export function pruneOverrides(edl: EDL): void {
  if (!edl.transitions?.overrides) return;
  const pairs = new Set(edl.segments.slice(0, -1).map((s, i) => `${s.id}>${edl.segments[i + 1].id}`));
  edl.transitions.overrides = edl.transitions.overrides.filter((o) => pairs.has(`${o.from}>${o.to}`));
}

export function trimSegment(edl: EDL, id: string, range: { src_start?: number; src_end?: number }): void {
  const s = edl.segments[index(edl, id)];
  if (!s) return;
  const dur = edl.source.duration_s;
  let start = range.src_start ?? s.src_start;
  let end = range.src_end ?? s.src_end;
  start = Math.max(0, Math.min(start, dur));
  end = Math.max(0, Math.min(end, dur));
  if (range.src_start !== undefined) start = Math.min(start, end - MIN_SEGMENT_S);
  if (range.src_end !== undefined) end = Math.max(end, start + MIN_SEGMENT_S);
  s.src_start = Math.max(0, start);
  s.src_end = Math.min(dur, end);
}

export function removeSegment(edl: EDL, id: string): void {
  if (edl.segments.length <= 1) return;
  edl.segments = edl.segments.filter((s) => s.id !== id);
  pruneOverrides(edl);
}

export function moveSegment(edl: EDL, id: string, toIndex: number): void {
  const from = index(edl, id);
  if (from < 0) return;
  const [seg] = edl.segments.splice(from, 1);
  edl.segments.splice(Math.max(0, Math.min(toIndex, edl.segments.length)), 0, seg);
  pruneOverrides(edl);
}

export function addSegment(edl: EDL, srcStart: number, srcEnd: number, atIndex = edl.segments.length): string | null {
  if (edl.segments.length >= MAX_SEGMENTS) return null;
  const start = Math.max(0, srcStart);
  const end = Math.min(edl.source.duration_s, Math.max(srcEnd, start + MIN_SEGMENT_S));
  const seg: Segment = { id: nextSegmentId(edl), src_start: start, src_end: end, reason: "Added by you", crop: [] };
  edl.segments.splice(Math.max(0, Math.min(atIndex, edl.segments.length)), 0, seg);
  pruneOverrides(edl);
  return seg.id;
}

/** Split the segment playing at tOut into two. Each half must be at least 1 s. */
export function splitAt(edl: EDL, tOut: number): boolean {
  const hit = outToSrc(edl, tOut)[0];
  if (!hit || edl.segments.length >= MAX_SEGMENTS) return false;
  const [i, src] = hit;
  const s = edl.segments[i];
  if (src - s.src_start < MIN_SEGMENT_S || s.src_end - src < MIN_SEGMENT_S) return false;
  const second: Segment = { ...s, id: nextSegmentId(edl), src_start: src, crop: (s.crop ?? []).filter((k) => k.t >= src) };
  s.src_end = src;
  s.crop = (s.crop ?? []).filter((k) => k.t <= src);
  edl.segments.splice(i + 1, 0, second);
  // The second half inherits the transition that followed the original segment,
  // and a hard cut joins the halves so the split is seamless.
  edl.transitions = edl.transitions ?? { default: { type: "fade", duration_s: 0.4 }, overrides: [] };
  edl.transitions.overrides = [
    ...(edl.transitions.overrides ?? []).map((o) => (o.from === s.id ? { ...o, from: second.id } : o)),
    { from: s.id, to: second.id, type: "cut", duration_s: 0.4 },
  ];
  return true;
}

export function setTransition(
  edl: EDL,
  target: { all: true } | { from: string; to: string },
  type: TransitionType,
  durationS: number,
): void {
  edl.transitions = edl.transitions ?? { default: { type: "fade", duration_s: 0.4 }, overrides: [] };
  if ("all" in target) {
    edl.transitions.default = { type, duration_s: durationS };
    edl.transitions.overrides = [];
    return;
  }
  const rest = (edl.transitions.overrides ?? []).filter((o) => !(o.from === target.from && o.to === target.to));
  edl.transitions.overrides = [...rest, { from: target.from, to: target.to, type, duration_s: durationS }];
}

export function setAspect(edl: EDL, aspect: string, width: number, height: number, framing: Framing): void {
  edl.output = { ...(edl.output ?? { fps: 30 }), aspect, width, height, framing, fps: edl.output?.fps ?? 30 } as EDL["output"];
}

export function setCaptionEdit(edl: EDL, cueId: string, text: string | null): void {
  edl.captions = edl.captions ?? { enabled: true, style: "bold-center", edits: {} };
  const edits = { ...(edl.captions.edits ?? {}) };
  if (text === null) delete edits[cueId];
  else edits[cueId] = text;
  edl.captions.edits = edits;
}
