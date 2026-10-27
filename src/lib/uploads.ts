"use client";
// Layout-level upload manager (architecture.md section 14): uploads keep going while the user
// switches videos. Multipart: 16 MB parts, 4 in parallel, each part retried 3 times.
// Closing the tab stops an upload; the history row then shows "Upload interrupted".
import { create } from "zustand";
import { ApiError, api, unwrap } from "@/api/client";

const PARALLEL = 4;
const PART_RETRIES = 3;
const URL_BATCH = 20;

export type UploadStatus = "starting" | "uploading" | "finishing" | "done" | "failed";

export interface UploadItem {
  key: string; // project id once created, else a temporary key
  projectId: string | null;
  title: string;
  size: number;
  loaded: number;
  status: UploadStatus;
  error?: string;
}

interface UploadState {
  items: Record<string, UploadItem>;
  update: (key: string, patch: Partial<UploadItem>) => void;
  remove: (key: string) => void;
}

export const useUploads = create<UploadState>((set) => ({
  items: {},
  update: (key, patch) =>
    set((s) => ({ items: { ...s.items, [key]: { ...s.items[key], ...patch } as UploadItem } })),
  remove: (key) =>
    set((s) => {
      const items = { ...s.items };
      delete items[key];
      return { items };
    }),
}));

export function percentOf(u: UploadItem): number {
  return u.size ? Math.min(100, Math.round((u.loaded / u.size) * 100)) : 0;
}

/** Plain-language text for the API's limit and media errors. */
export function uploadErrorMessage(e: unknown): string {
  if (e instanceof ApiError) {
    const limit = e.details?.limit as number | undefined;
    switch (e.code) {
      case "quota_exceeded":
        return e.message || "You have reached your upload limit. Delete a video to make room.";
      case "file_too_large":
        return limit ? `This file is larger than ${limit} MB.` : "This file is too large.";
      case "duration_too_long":
        return limit ? `This video is longer than ${Math.round(limit / 60)} minutes.` : "This video is too long.";
      case "unsupported_media":
        return "Please choose a video file.";
      default:
        return e.message;
    }
  }
  return "The upload stopped. Check your connection and try again.";
}

function putPart(url: string, blob: Blob, onProgress: (loaded: number) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    xhr.upload.onprogress = (e) => onProgress(e.loaded);
    xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(`part ${xhr.status}`)));
    xhr.onerror = () => reject(new Error("network"));
    xhr.send(blob);
  });
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Read the duration in the browser so a too-long video is refused before uploading. */
export function readDuration(file: File): Promise<number | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const v = document.createElement("video");
    v.preload = "metadata";
    const done = (d: number | null) => {
      URL.revokeObjectURL(url);
      resolve(d);
    };
    v.onloadedmetadata = () => done(Number.isFinite(v.duration) ? v.duration : null);
    v.onerror = () => done(null);
    setTimeout(() => done(null), 8000);
    v.src = url;
  });
}

export interface StartUploadArgs {
  file: File;
  title: string;
  durationS: number | null;
  srtText?: string;
  onCreated?: (projectId: string) => void;
  onDone?: (projectId: string) => void;
}

export async function startUpload({ file, title, durationS, srtText, onCreated, onDone }: StartUploadArgs) {
  const store = useUploads.getState();
  const tempKey = `tmp-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  store.update(tempKey, { key: tempKey, projectId: null, title, size: file.size, loaded: 0, status: "starting" });

  let created;
  try {
    created = await unwrap(
      api.POST("/api/projects", {
        body: {
          title,
          filename: file.name,
          size: file.size,
          content_type: file.type || "video/mp4",
          duration_s: durationS ?? undefined,
          srt_text: srtText || undefined,
        },
      }),
    );
  } catch (e) {
    store.remove(tempKey);
    throw e;
  }
  const projectId = created.project_id;
  const item = useUploads.getState().items[tempKey];
  store.remove(tempKey);
  store.update(projectId, { ...item, key: projectId, projectId, status: "uploading" });
  onCreated?.(projectId);

  const partSize = created.part_size_mb * 1024 * 1024;
  const count = created.part_count;
  const loadedByPart = new Array<number>(count + 1).fill(0);
  const report = () =>
    useUploads.getState().update(projectId, { loaded: loadedByPart.reduce((a, b) => a + b, 0) });

  const urls: Record<number, string> = {};
  const fetchUrls = async (from: number) => {
    const nums = Array.from({ length: Math.min(URL_BATCH, count - from + 1) }, (_, i) => from + i);
    const res = await unwrap(
      api.POST("/api/projects/{project_id}/upload/part-urls", {
        params: { path: { project_id: projectId } },
        body: { part_numbers: nums },
      }),
    );
    for (const [k, v] of Object.entries(res.urls)) urls[Number(k)] = v;
  };

  let next = 1;
  const worker = async () => {
    while (next <= count) {
      const n = next++;
      const blob = file.slice((n - 1) * partSize, Math.min(file.size, n * partSize));
      for (let attempt = 0; ; attempt++) {
        try {
          if (!urls[n]) await fetchUrls(n);
          await putPart(urls[n], blob, (loaded) => {
            loadedByPart[n] = loaded;
            report();
          });
          loadedByPart[n] = blob.size;
          report();
          break;
        } catch (e) {
          loadedByPart[n] = 0;
          report();
          if (attempt + 1 >= PART_RETRIES) throw e;
          delete urls[n]; // the URL may have expired
          await sleep(1000 * 2 ** attempt);
        }
      }
    }
  };

  try {
    await Promise.all(Array.from({ length: Math.min(PARALLEL, count) }, worker));
    useUploads.getState().update(projectId, { status: "finishing", loaded: file.size });
    await unwrap(api.POST("/api/projects/{project_id}/uploaded", { params: { path: { project_id: projectId } } }));
    useUploads.getState().update(projectId, { status: "done" });
    onDone?.(projectId);
    setTimeout(() => useUploads.getState().remove(projectId), 5_000);
  } catch (e) {
    useUploads.getState().update(projectId, { status: "failed", error: uploadErrorMessage(e) });
    throw e;
  }
}
