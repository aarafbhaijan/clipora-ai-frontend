// Message payloads written by the agent layer. The API passes `payload` through unchanged, so every
// field is read defensively.
import type { MessageOut } from "@/api/types";

export interface IdeaAnchor {
  start_s: number;
  end_s: number;
}

export interface Idea {
  id: string;
  title: string;
  why?: string;
  format?: string;
  target_duration_s?: number;
  aspect?: string;
  style?: string;
  focus?: string;
  anchors: IdeaAnchor[];
}

export interface Suggestions {
  summary?: string;
  topics: string[];
  ideas: Idea[];
}

export interface Citation {
  cue_id: string;
  start_s: number;
  end_s: number;
  text?: string;
}

const num = (v: unknown): number | undefined => (typeof v === "number" && Number.isFinite(v) ? v : undefined);
const str = (v: unknown): string | undefined => (typeof v === "string" && v ? v : undefined);
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const obj = (v: unknown): Record<string, unknown> => (v && typeof v === "object" ? (v as Record<string, unknown>) : {});

export function readSuggestions(m: MessageOut): Suggestions {
  const p = obj(m.payload);
  return {
    summary: str(p.summary),
    topics: arr(p.topics).map(String),
    ideas: arr(p.ideas)
      .map(obj)
      .filter((i) => str(i.id) && str(i.title))
      .map((i) => ({
        id: String(i.id),
        title: String(i.title),
        why: str(i.why),
        format: str(i.format),
        target_duration_s: num(i.target_duration_s),
        aspect: str(i.aspect),
        style: str(i.style),
        focus: str(i.focus),
        anchors: arr(i.anchors)
          .map(obj)
          .map((a) => ({ start_s: num(a.start_s), end_s: num(a.end_s) }))
          .filter((a): a is IdeaAnchor => a.start_s !== undefined && a.end_s !== undefined),
      })),
  };
}

export function readChoices(m: MessageOut): string[] {
  return arr(obj(m.payload).choices).filter((c): c is string => typeof c === "string");
}

export function readCitations(m: MessageOut): Citation[] {
  return arr(obj(m.payload).citations)
    .map(obj)
    .map((c) => ({
      cue_id: str(c.cue_id) ?? str(c.id) ?? "",
      start_s: num(c.start_s) ?? NaN,
      end_s: num(c.end_s) ?? NaN,
      text: str(c.text),
    }))
    .filter((c) => Number.isFinite(c.start_s));
}

export function readPreviousVersion(m: MessageOut): number | undefined {
  return num(obj(m.payload).previous_version);
}

/** The idea a user message picked ("Make this"), so a retry can pick it again. */
export function readSuggestionId(m: MessageOut): string | undefined {
  return str(obj(obj(m.payload).suggestion).id);
}

export function readChoiceSent(m: MessageOut): string | undefined {
  return str(obj(m.payload).choice);
}
