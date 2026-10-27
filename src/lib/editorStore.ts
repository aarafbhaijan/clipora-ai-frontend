"use client";
// Edit state per project (architecture.md section 14): { edl, version, dirty, past[], future[] } with
// immer patches. Kept for the last 3 opened projects so switching back is instant.
import { applyPatches, enablePatches, produceWithPatches, type Draft, type Patch } from "immer";
import { create } from "zustand";
import type { EDL } from "@/api/types";

enablePatches();

const KEEP = 3;
const MAX_HISTORY = 200;

interface Step {
  patches: Patch[];
  inverse: Patch[];
}

export interface Conflict {
  version: number;
  latest: EDL | null;
}

export interface ProjectEdit {
  edl: EDL | null;
  version: number;
  dirty: boolean;
  past: Step[];
  future: Step[];
  seq: number; // bumps on every local change; a save only clears dirty if seq did not move
  saving: boolean;
  saveError: string | null;
  conflict: Conflict | null;
}

const empty = (): ProjectEdit => ({
  edl: null,
  version: 0,
  dirty: false,
  past: [],
  future: [],
  seq: 0,
  saving: false,
  saveError: null,
  conflict: null,
});

interface EditorState {
  byId: Record<string, ProjectEdit>;
  order: string[];
  /** Server data arrived. Replace the local plan unless the user has unsaved edits. */
  load: (id: string, edl: EDL | null, version: number) => void;
  edit: (id: string, recipe: (draft: Draft<EDL>) => void | EDL) => void;
  undo: (id: string) => void;
  redo: (id: string) => void;
  patchMeta: (id: string, patch: Partial<ProjectEdit>) => void;
  saved: (id: string, version: number, edl: EDL, seqAtSave: number) => void;
  keepMine: (id: string) => void;
  takeTheirs: (id: string) => void;
}

function touch(order: string[], id: string): string[] {
  return [id, ...order.filter((x) => x !== id)].slice(0, KEEP);
}

export const useEditor = create<EditorState>((set, get) => {
  const update = (id: string, fn: (e: ProjectEdit) => ProjectEdit) =>
    set((s) => {
      const order = touch(s.order, id);
      const byId: Record<string, ProjectEdit> = {};
      for (const k of order) byId[k] = s.byId[k] ?? empty();
      byId[id] = fn(byId[id]);
      return { byId, order };
    });

  return {
    byId: {},
    order: [],
    load: (id, edl, version) =>
      update(id, (e) => {
        if (e.dirty || e.saving) return e;
        // A poll that left before our last save can arrive after it; never go back to an older version.
        if (e.edl && version <= e.version) return e;
        return { ...e, edl, version, past: [], future: [], saveError: null };
      }),
    edit: (id, recipe) =>
      update(id, (e) => {
        if (!e.edl) return e;
        const [next, patches, inverse] = produceWithPatches(e.edl, recipe as (d: Draft<EDL>) => void);
        if (!patches.length) return e;
        return {
          ...e,
          edl: next as EDL,
          dirty: true,
          seq: e.seq + 1,
          saveError: null,
          past: [...e.past, { patches, inverse }].slice(-MAX_HISTORY),
          future: [],
        };
      }),
    undo: (id) =>
      update(id, (e) => {
        const step = e.past[e.past.length - 1];
        if (!step || !e.edl) return e;
        return {
          ...e,
          edl: applyPatches(e.edl, step.inverse),
          past: e.past.slice(0, -1),
          future: [step, ...e.future],
          dirty: true,
          seq: e.seq + 1,
        };
      }),
    redo: (id) =>
      update(id, (e) => {
        const step = e.future[0];
        if (!step || !e.edl) return e;
        return {
          ...e,
          edl: applyPatches(e.edl, step.patches),
          past: [...e.past, step],
          future: e.future.slice(1),
          dirty: true,
          seq: e.seq + 1,
        };
      }),
    patchMeta: (id, patch) => update(id, (e) => ({ ...e, ...patch })),
    saved: (id, version, edl, seqAtSave) =>
      update(id, (e) =>
        e.seq === seqAtSave
          ? // Take the server's copy: it carries recomputed crop keyframes.
            { ...e, version, edl, dirty: false, saving: false, saveError: null }
          : { ...e, version, saving: false },
      ),
    keepMine: (id) => {
      const e = get().byId[id];
      if (!e?.conflict) return;
      update(id, (x) => ({ ...x, version: e.conflict!.version, conflict: null, dirty: true, seq: x.seq + 1 }));
    },
    takeTheirs: (id) =>
      update(id, (e) =>
        e.conflict
          ? { ...e, edl: e.conflict.latest, version: e.conflict.version, conflict: null, dirty: false, past: [], future: [] }
          : e,
      ),
  };
});

export function useProjectEdit(id: string): ProjectEdit {
  return useEditor((s) => s.byId[id]) ?? EMPTY;
}

const EMPTY = empty();
