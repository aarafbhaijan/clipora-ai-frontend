// Who is talking, and who the frame follows, at a source time. Mirrors core.crop.focus_spans, so the green box is
// exactly what a portrait export follows: the talker of the last turn long enough to cut to (cut_min_s) holds
// the frame until the next one; before anyone talks it is the main person.
import type { SpeakerOut, SpeakerTurnOut } from "@/api/types";

/** The turn covering source time t, if any (turns are ordered and don't overlap). */
export function talkingAt(speaker: SpeakerOut, t: number): SpeakerTurnOut | null {
  const turns = speaker.turns ?? [];
  let lo = 0;
  let hi = turns.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (turns[mid].start > t) hi = mid - 1;
    else if (turns[mid].end < t) lo = mid + 1;
    else return turns[mid];
  }
  return null;
}

/** Track id the crop follows at source time t. */
export function focusTrack(speaker: SpeakerOut, t: number): number | null {
  let who = speaker.main_track_id ?? null;
  for (const turn of speaker.turns ?? []) {
    if (turn.start > t) break;
    if (turn.end - turn.start >= (speaker.cut_min_s ?? 0)) who = turn.track_id;
  }
  return who;
}

/** Label per talking track ("Person 1"...), from the turns. */
export function personLabels(speaker: SpeakerOut | undefined): Map<number, string> {
  const out = new Map<number, string>();
  for (const turn of speaker?.turns ?? []) if (!out.has(turn.track_id)) out.set(turn.track_id, turn.label);
  return out;
}

/** Palette index of each talker, in order of first talking. */
export function personIndex(speaker: SpeakerOut | undefined): Map<number, number> {
  const out = new Map<number, number>();
  for (const turn of speaker?.turns ?? []) if (!out.has(turn.track_id)) out.set(turn.track_id, out.size);
  return out;
}
