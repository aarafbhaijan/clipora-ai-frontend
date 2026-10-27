"use client";
// Server state with TanStack Query. Polling intervals follow architecture.md section 8 exactly:
// editor 2.5 s while a task is queued or running (not while waiting for the user);
// sidebar 3 s while anything is active, else 30 s, and on window focus.
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, unwrap } from "./client";
import type { HistoryState, MetadataOut, ProjectDetail, ProjectPage } from "./types";

export const keys = {
  me: ["me"] as const,
  projects: ["projects"] as const,
  project: (id: string) => ["project", id] as const,
  metadata: (id: string) => ["metadata", id] as const,
  versions: (id: string) => ["versions", id] as const,
  speaker: (id: string, version: number) => ["speaker", id, version] as const,
  export: (id: string) => ["export", id] as const,
  memories: ["memories"] as const,
  search: (id: string, q: string) => ["search", id, q] as const,
  adminSettings: ["admin", "settings"] as const,
  adminUsers: (start: string, end: string, q: string) => ["admin", "users", start, end, q] as const,
  adminUser: (id: string, start: string, end: string) => ["admin", "user", id, start, end] as const,
  adminUsage: (start: string, end: string, groupBy: string) => ["admin", "usage", start, end, groupBy] as const,
};

export const ACTIVE_STATES: HistoryState[] = [
  "uploading",
  "waiting",
  "processing",
  "finding_ideas",
  "planning",
  "exporting",
];

const isWorking = (status?: string) => status === "queued" || status === "running";

export function useMe() {
  return useQuery({
    queryKey: keys.me,
    queryFn: () => unwrap(api.GET("/api/me")),
    staleTime: 30_000,
  });
}

export function useProjects() {
  return useInfiniteQuery({
    queryKey: keys.projects,
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }) =>
      unwrap(api.GET("/api/projects", { params: { query: pageParam ? { cursor: pageParam } : {} } })),
    getNextPageParam: (last: ProjectPage) => last.next_cursor,
    refetchOnWindowFocus: true,
    refetchInterval: (q) => {
      const items = q.state.data?.pages.flatMap((p) => p.items) ?? [];
      return items.some((i) => ACTIVE_STATES.includes(i.state)) ? 3_000 : 30_000;
    },
  });
}

export function useProject(id: string) {
  return useQuery({
    queryKey: keys.project(id),
    queryFn: () => unwrap(api.GET("/api/projects/{project_id}", { params: { path: { project_id: id } } })),
    refetchInterval: (q) => {
      const d = q.state.data as ProjectDetail | undefined;
      if (!d) return false;
      return isWorking(d.active_job?.status) || d.status === "uploading" || d.status === "ingesting" ? 2_500 : false;
    },
  });
}

export function useMetadata(id: string, enabled: boolean) {
  return useQuery({
    queryKey: keys.metadata(id),
    enabled,
    queryFn: () => unwrap(api.GET("/api/projects/{project_id}/metadata", { params: { path: { project_id: id } } })),
    refetchInterval: (q) => (isWorking((q.state.data as MetadataOut | undefined)?.active_job?.status) ? 2_500 : false),
  });
}

export function useVersions(id: string, enabled: boolean) {
  return useQuery({
    queryKey: keys.versions(id),
    enabled,
    queryFn: () =>
      unwrap(api.GET("/api/projects/{project_id}/edl/versions", { params: { path: { project_id: id } } })),
  });
}

export function useExport(exportId: string | null) {
  return useQuery({
    queryKey: keys.export(exportId ?? "none"),
    enabled: !!exportId,
    queryFn: () => unwrap(api.GET("/api/exports/{export_id}", { params: { path: { export_id: exportId! } } })),
    refetchInterval: (q) => {
      const s = q.state.data?.status;
      return s === "queued" || s === "rendering" ? 2_500 : false;
    },
  });
}

export function useMemories() {
  return useQuery({ queryKey: keys.memories, queryFn: () => unwrap(api.GET("/api/memories")) });
}

export function useRenameProject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, title }: { id: string; title: string }) =>
      unwrap(api.PATCH("/api/projects/{project_id}", { params: { path: { project_id: id } }, body: { title } })),
    onSuccess: (_, v) => {
      qc.invalidateQueries({ queryKey: keys.projects });
      qc.invalidateQueries({ queryKey: keys.project(v.id) });
    },
  });
}

export function useDeleteProject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      unwrap(api.DELETE("/api/projects/{project_id}", { params: { path: { project_id: id } } })),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: keys.projects });
      qc.invalidateQueries({ queryKey: keys.me });
    },
  });
}

export function useRetryJob(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (jobId: string) => unwrap(api.POST("/api/jobs/{job_id}/retry", { params: { path: { job_id: jobId } } })),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: keys.project(projectId) });
      qc.invalidateQueries({ queryKey: keys.projects });
    },
  });
}

export function useMoreIdeas(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => unwrap(api.POST("/api/projects/{project_id}/ideas", { params: { path: { project_id: projectId } } })),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: keys.project(projectId) });
      qc.invalidateQueries({ queryKey: keys.projects });
    },
  });
}

export function useSendMessage(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { content?: string; suggestion_id?: string; choice?: string }) =>
      unwrap(
        api.POST("/api/projects/{project_id}/messages", {
          params: { path: { project_id: projectId } },
          body: { content: body.content ?? "", suggestion_id: body.suggestion_id, choice: body.choice },
        }),
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: keys.project(projectId) });
      qc.invalidateQueries({ queryKey: keys.projects });
    },
  });
}

export function useFeedback(projectId: string) {
  return useMutation({
    mutationFn: (body: {
      target_kind: "plan" | "idea" | "metadata" | "answer";
      target_ref: string;
      signal: "up" | "down";
      reason?: string;
    }) => unwrap(api.POST("/api/projects/{project_id}/feedback", { params: { path: { project_id: projectId } }, body })),
  });
}

/** YOLO person boxes and the main speaker (for the overlay). Loaded only while the overlay is on. */
export function useSpeaker(id: string, version: number, enabled: boolean) {
  return useQuery({
    queryKey: keys.speaker(id, version),
    enabled,
    staleTime: Infinity, // detections never change; the main track only changes with the plan (in the key)
    queryFn: () => unwrap(api.GET("/api/projects/{project_id}/speaker", { params: { path: { project_id: id } } })),
  });
}
