"use client";
// Player state (architecture.md section 14): { playing, tOut, segIndex }, plus the source-playback mode
// and seek requests from the transcript, timeline and chat citations.
import { create } from "zustand";

export interface SeekRequest {
  n: number;
  tOut?: number;
  src?: number; // play the source from here (outside the edit)
}

interface PlayerState {
  playing: boolean;
  tOut: number;
  segIndex: number;
  sourceMode: boolean;
  sourceTime: number;
  selectedId: string | null;
  /** Timeline mode: "view" scrubs to any frame, "edit" selects, trims and splits clips. */
  timelineMode: "view" | "edit";
  /** Source ranges to outline on the source lane (hovering an idea card). */
  highlights: { start: number; end: number }[];
  seek: SeekRequest;
  toggleRequest: number;
  /** Bumped to stop every video in the editor (switching videos, leaving the page). */
  stopRequest: number;
  /** Draw the YOLO person boxes over the preview (green = main speaker). UI only; never exported. */
  showSpeaker: boolean;
  /** Play the original upload instead of the lighter editor copy (sharper, slower to load). Never changes export. */
  fullQuality: boolean;
  /** Playback volume 0..1 and mute, shared by every video in the editor. */
  volume: number;
  muted: boolean;
  set: (p: Partial<Omit<PlayerState, "set" | "seekOut" | "seekSource" | "toggle" | "stop" | "reset">>) => void;
  seekOut: (tOut: number) => void;
  seekSource: (src: number) => void;
  toggle: () => void;
  stop: () => void;
  reset: () => void;
}

export const usePlayer = create<PlayerState>((set) => ({
  playing: false,
  tOut: 0,
  segIndex: 0,
  sourceMode: false,
  sourceTime: 0,
  selectedId: null,
  timelineMode: "view",
  highlights: [],
  seek: { n: 0 },
  toggleRequest: 0,
  stopRequest: 0,
  showSpeaker: false,
  fullQuality: false,
  volume: 1,
  muted: false,
  set: (p) => set(p),
  seekOut: (tOut) => set((s) => ({ seek: { n: s.seek.n + 1, tOut }, sourceMode: false })),
  seekSource: (src) => set((s) => ({ seek: { n: s.seek.n + 1, src }, sourceMode: true, sourceTime: src })),
  toggle: () => set((s) => ({ toggleRequest: s.toggleRequest + 1 })),
  stop: () => set((s) => ({ stopRequest: s.stopRequest + 1, playing: false, sourceMode: false })),
  reset: () =>
    set({
      playing: false,
      tOut: 0,
      segIndex: 0,
      sourceMode: false,
      sourceTime: 0,
      selectedId: null,
      timelineMode: "view",
      highlights: [],
    }),
}));
