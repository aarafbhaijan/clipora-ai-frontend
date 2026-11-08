// What the editor agent is doing right now, in one place, for the chat panel, its header and the status bar.
import type { ProjectDetail } from "@/api/types";
import { STAGE_LABEL } from "./states";

// Keys are the stage names the agent writes with ctx.progress (backend/packages/agent edit_graph.py).
export const AGENT_STEPS: { key: string; title: string; detail: string }[] = [
  { key: "understanding", title: "Understanding your request", detail: "Reads your message, saved preferences and the current plan" },
  { key: "finding moments", title: "Finding the right moments", detail: "Searches the transcript for clips that fit" },
  { key: "building plan", title: "Building the plan", detail: "Chooses and orders clips to hit the target length" },
  { key: "framing the speaker", title: "Framing the speaker", detail: "Points the crop at whoever is talking" },
  { key: "checking", title: "Checking the plan", detail: "Reviews the clips against your request" },
  { key: "saving", title: "Saving", detail: "Saves the new version" },
];

// Stages outside the planning path: shown as a single step.
export const OTHER_STAGES: Record<string, string> = {
  "changing the plan": "Changing the plan",
  "searching the video": "Searching the video",
};

export type AgentMode = "preparing" | "idle" | "working" | "waiting" | "failed" | "unavailable";

export interface AgentStatus {
  mode: AgentMode;
  /** Short text for the status bar and the panel header. */
  label: string;
  /** 1-based step of AGENT_STEPS while planning, else null. */
  step: number | null;
  percent: number | null;
}

export function stepIndex(stage: string | null | undefined): number {
  return Math.max(0, AGENT_STEPS.findIndex((s) => s.key === stage));
}

export function agentStatus(p: ProjectDetail): AgentStatus {
  const job = p.active_job;
  if (p.status === "uploading" || p.status === "ingesting") {
    const stage = job?.stage ? (STAGE_LABEL[job.stage] ?? "Preparing the video") : "Preparing the video";
    return { mode: "preparing", label: stage, step: null, percent: job?.percent ?? null };
  }
  if (p.status !== "ready") return { mode: "unavailable", label: "Not available", step: null, percent: null };
  if (job && (job.kind === "agent" || job.kind === "suggest")) {
    if (job.status === "waiting_input") return { mode: "waiting", label: "Waiting for your answer", step: null, percent: null };
    if (job.status === "queued" || job.status === "running") {
      if (job.kind === "suggest") return { mode: "working", label: "Finding ideas", step: null, percent: job.percent };
      if (job.stage && OTHER_STAGES[job.stage]) {
        return { mode: "working", label: OTHER_STAGES[job.stage], step: null, percent: job.percent };
      }
      const i = stepIndex(job.stage);
      return { mode: "working", label: job.status === "queued" ? "Starting" : AGENT_STEPS[i].title, step: i + 1, percent: job.percent };
    }
  }
  if (p.failed_job?.kind === "agent") return { mode: "failed", label: "Last request didn't finish", step: null, percent: null };
  return { mode: "idle", label: "Ready", step: null, percent: null };
}
