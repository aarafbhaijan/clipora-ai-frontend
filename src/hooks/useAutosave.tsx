"use client";
// Autosave: 800 ms after the last change, PATCH /edl with If-Match. A 409 asks the user to
// keep their edits (rebase onto the newer version) or take the new plan. Nothing is overwritten silently.
import { useQueryClient } from "@tanstack/react-query";
import { Modal, Typography } from "antd";
import { useEffect } from "react";
import { ApiError, api, unwrap } from "@/api/client";
import { keys } from "@/api/hooks";
import type { EDL } from "@/api/types";
import { useEditor, useProjectEdit } from "@/lib/editorStore";

const DEBOUNCE_MS = 800;

function issuesText(e: ApiError): string {
  const issues = (e.details?.issues as { message?: string }[] | undefined) ?? [];
  const first = issues.map((i) => i.message).filter(Boolean).slice(0, 2).join("; ");
  return first ? `${e.message} ${first}.` : e.message;
}

export function useAutosave(projectId: string) {
  const qc = useQueryClient();
  const state = useProjectEdit(projectId);
  const { dirty, saving, conflict, seq, saveError } = state;

  useEffect(() => {
    if (!dirty || saving || conflict || saveError) return;
    const timer = setTimeout(async () => {
      const store = useEditor.getState();
      const e = store.byId[projectId];
      if (!e?.edl || !e.dirty) return;
      const seqAtSave = e.seq;
      store.patchMeta(projectId, { saving: true });
      try {
        const out = await unwrap(
          api.PATCH("/api/projects/{project_id}/edl", {
            params: { path: { project_id: projectId }, header: { "If-Match": e.version } },
            body: e.edl,
          }),
        );
        useEditor.getState().saved(projectId, out.version, out.edl, seqAtSave);
        qc.invalidateQueries({ queryKey: keys.versions(projectId) });
      } catch (err) {
        if (err instanceof ApiError && err.code === "version_conflict") {
          useEditor.getState().patchMeta(projectId, {
            saving: false,
            conflict: {
              version: Number(err.details?.version ?? 0),
              latest: (err.details?.latest as EDL | null) ?? null,
            },
          });
        } else {
          useEditor.getState().patchMeta(projectId, {
            saving: false,
            saveError:
              err instanceof ApiError && err.code === "edl_invalid"
                ? issuesText(err)
                : "Couldn't save your changes. They are kept here and will save when you edit again.",
          });
        }
      }
    }, DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [projectId, dirty, saving, conflict, seq, saveError, qc]);
}

export function ConflictModal({ projectId }: { projectId: string }) {
  const { conflict } = useProjectEdit(projectId);
  const keepMine = useEditor((s) => s.keepMine);
  const takeTheirs = useEditor((s) => s.takeTheirs);
  return (
    <Modal
      open={!!conflict}
      title="The plan changed while you were editing"
      closable={false}
      mask={{ closable: false }}
      okText="Keep my edits"
      cancelText="Take the new plan"
      onOk={() => keepMine(projectId)}
      onCancel={() => takeTheirs(projectId)}
    >
      <Typography.Paragraph>
        Clipora saved a newer version of this plan. Keep your edits on top of it, or switch to the new plan and drop
        your unsaved edits.
      </Typography.Paragraph>
    </Modal>
  );
}
