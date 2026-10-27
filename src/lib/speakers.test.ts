import { describe, expect, it } from "vitest";
import type { SpeakerOut } from "@/api/types";
import { focusTrack, personLabels, talkingAt } from "./speakers";

const speaker = {
  available: true,
  main_track_id: 1,
  cut_min_s: 1.5,
  turns: [
    { start: 2, end: 10, track_id: 2, label: "Person 1", confidence: 0.8 },
    { start: 11, end: 11.5, track_id: 1, label: "Person 2", confidence: 0.6 }, // too short to cut to
    { start: 14, end: 20, track_id: 1, label: "Person 2", confidence: 0.9 },
  ],
} as unknown as SpeakerOut;

describe("speakers", () => {
  it("follows the main person, then each talker, holding through pauses", () => {
    expect(focusTrack(speaker, 0)).toBe(1);
    expect(focusTrack(speaker, 5)).toBe(2);
    expect(focusTrack(speaker, 11.2)).toBe(2);
    expect(focusTrack(speaker, 12)).toBe(2);
    expect(focusTrack(speaker, 15)).toBe(1);
  });

  it("finds who talks at a moment", () => {
    expect(talkingAt(speaker, 11.2)?.label).toBe("Person 2");
    expect(talkingAt(speaker, 12)).toBeNull();
    expect(personLabels(speaker).get(2)).toBe("Person 1");
  });
});
