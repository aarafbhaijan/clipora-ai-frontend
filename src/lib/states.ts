// History chip text (design.md section 6). Color is never the only signal: every chip has text.
import type { HistoryState, ProjectListItem } from "@/api/types";

export const STAGE_LABEL: Record<string, string> = {
  fetch: "Fetching from YouTube",
  probe: "Checking the file",
  transcribe: "Transcribing",
  proxy: "Preparing preview",
  thumbnails: "Making thumbnails",
  waveform: "Reading audio",
  detect: "Finding people",
  speakers: "Finding who talks",
  index: "Indexing",
  prepare: "Preparing",
  segments: "Rendering clips",
  finish: "Finishing",
  upload: "Saving",
};

export type ChipColor = "processing" | "success" | "warning" | "error" | "default";

export interface Chip {
  text: string;
  color: ChipColor;
  percent?: number;
  dot?: boolean;
  active: boolean;
}

export function chipFor(item: Pick<ProjectListItem, "state" | "active_job">, uploadPercent?: number): Chip {
  const job = item.active_job;
  const s: HistoryState = item.state;
  switch (s) {
    case "uploading":
      return { text: "Uploading", color: "processing", percent: uploadPercent, active: true };
    case "waiting":
      return { text: "Waiting to start", color: "default", active: true };
    case "processing": {
      const stage = job?.stage ? STAGE_LABEL[job.stage] ?? "Working on it" : "Working on it";
      return { text: stage, color: "processing", percent: job?.percent, active: true };
    }
    case "finding_ideas":
      return { text: "Finding ideas", color: "processing", active: true };
    case "pick_idea":
      return { text: "Pick an idea", color: "warning", dot: true, active: false };
    case "planning":
      return { text: "Planning your edit", color: "processing", active: true };
    case "needs_answer":
      return { text: "Needs your answer", color: "warning", dot: true, active: false };
    case "exporting":
      return { text: "Exporting", color: "processing", percent: job?.percent, active: true };
    case "exported":
      return { text: "Exported", color: "success", active: false };
    case "failed":
      return { text: "Failed", color: "error", active: false };
    default:
      return { text: "Ready", color: "success", active: false };
  }
}
