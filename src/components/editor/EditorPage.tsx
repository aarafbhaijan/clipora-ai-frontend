"use client";
// The editor for one video (design.md section 4): chat and metadata tabs, preview, transcript, timeline.
import { CheckOutlined, CloudSyncOutlined, ExportOutlined, WarningOutlined } from "@ant-design/icons";
import { Alert, Button, Flex, Splitter, Tabs, Tag, Tooltip, Typography } from "antd";
import { useEffect, useMemo, useState } from "react";
import { useProject, useSpeaker } from "@/api/hooks";
import { useTranscript, useWaveform } from "@/hooks/useMedia";
import { ConflictModal, useAutosave } from "@/hooks/useAutosave";
import type { EDL } from "@/api/types";
import { removeSegment, splitAt } from "@/lib/edlOps";
import { useEditor, useProjectEdit } from "@/lib/editorStore";
import { usePlayer } from "@/lib/playerStore";
import { outputDuration } from "@/lib/timemap";
import { wordBoundaries } from "@/lib/transcript";
import { chipFor } from "@/lib/states";
import PageHeader from "../common/PageHeader";
import { ErrorState, Loading } from "../common/States";
import AspectPicker from "./player/AspectPicker";
import ChatPanel from "./chat/ChatPanel";
import ExportDrawer from "./export/ExportDrawer";
import { GeneratedVideosPanel, useShorts } from "./chat/GeneratedVideos";
import MetadataPanel from "./metadata/MetadataPanel";
import Preview from "./player/Preview";
import { QualityToggle } from "./player/Quality";
import SourcePlayer from "./player/SourcePlayer";
import { SpeakerToggle } from "./player/SpeakerOverlay";
import SourceTimeline from "./timeline/SourceTimeline";
import Timeline from "./timeline/Timeline";
import TranscriptPanel from "./transcript/TranscriptPanel";

function isTyping(e: KeyboardEvent): boolean {
  const el = e.target as HTMLElement | null;
  if (!el) return false;
  return el.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName) || !!el.closest("[role=textbox]");
}

function SaveState({ projectId }: { projectId: string }) {
  const { dirty, saving, saveError } = useProjectEdit(projectId);
  if (saveError)
    return (
      <Tooltip title={saveError}>
        <Tag color="error" icon={<WarningOutlined />}>
          Not saved
        </Tag>
      </Tooltip>
    );
  if (saving || dirty)
    return (
      <Tag icon={<CloudSyncOutlined />} color="processing">
        Saving
      </Tag>
    );
  return (
    <Tag icon={<CheckOutlined />} color="success">
      Saved
    </Tag>
  );
}

export default function EditorPage({ projectId }: { projectId: string }) {
  const project = useProject(projectId);
  const p = project.data;
  const load = useEditor((s) => s.load);
  const edit = useEditor((s) => s.edit);
  const undo = useEditor((s) => s.undo);
  const redo = useEditor((s) => s.redo);
  const local = useProjectEdit(projectId);
  const resetPlayer = usePlayer((s) => s.reset);
  const [tab, setTab] = useState("chat");
  const [exportOpen, setExportOpen] = useState(false);
  const transcript = useTranscript(p?.assets.transcript_url, projectId);
  const waveform = useWaveform(p?.assets.waveform_url, projectId);
  const bounds = useMemo(() => wordBoundaries(transcript.data), [transcript.data]);
  const { shorts } = useShorts(projectId, p?.current_version ?? 0);
  const showSpeaker = usePlayer((s) => s.showSpeaker);
  const speaker = useSpeaker(projectId, p?.current_version ?? 0, showSpeaker && p?.status === "ready");

  useAutosave(projectId);

  useEffect(() => {
    resetPlayer();
  }, [projectId, resetPlayer]);

  // Server data (including agent versions) flows into the local store unless the user has unsaved edits.
  useEffect(() => {
    if (p) load(projectId, (p.edl as EDL | null) ?? null, p.current_version);
  }, [p, projectId, load]);

  const edl = local.edl;
  const agentBusy =
    !!p?.active_job && p.active_job.kind === "agent" && (p.active_job.status === "queued" || p.active_job.status === "running");
  const canEdit = !!edl && p?.status === "ready";

  // Keyboard: Space play/pause, S split, Delete remove, Cmd/Ctrl+Z undo, Shift+Cmd/Ctrl+Z redo.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isTyping(e)) return;
      const mod = e.metaKey || e.ctrlKey;
      const player = usePlayer.getState();
      if (e.code === "Space") {
        e.preventDefault();
        player.toggle();
      } else if (mod && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) redo(projectId);
        else undo(projectId);
      } else if (!mod && e.key.toLowerCase() === "s" && canEdit && player.timelineMode === "edit") {
        e.preventDefault();
        edit(projectId, (d) => void splitAt(d as EDL, player.tOut));
      } else if ((e.key === "Delete" || e.key === "Backspace") && canEdit && player.selectedId) {
        e.preventDefault();
        const id = player.selectedId;
        edit(projectId, (d) => removeSegment(d as EDL, id));
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [projectId, canEdit, edit, undo, redo]);

  if (project.isLoading) return <div style={{ padding: 24 }}><Loading rows={8} /></div>;
  if (project.isError && !p) return <ErrorState error={project.error} onRetry={() => project.refetch()} />;
  if (!p) return null;

  const chip = chipFor(p);
  const total = edl ? outputDuration(edl) : 0;

  // Right pane: only the player, using the full height. The transcript lives in its own tab on the left.
  const planArea = edl ? (
    <Flex vertical style={{ height: "100%" }}>
      <Flex justify="center" align="center" gap={8} wrap style={{ padding: "8px 8px 0" }}>
        <AspectPicker projectId={projectId} edl={edl} disabled={!canEdit} />
        <SpeakerToggle />
        {p.assets.source_url ? <QualityToggle /> : null}
      </Flex>
      <div style={{ flex: 1, minHeight: 0 }}>
        <Preview
          proxyUrl={p.assets.proxy_url}
          sourceUrl={p.assets.source_url}
          edl={edl}
          transcript={transcript.data}
          srcWidth={p.width ?? edl.source.width}
          srcHeight={p.height ?? edl.source.height}
          speaker={speaker.data}
        />
      </div>
    </Flex>
  ) : (
    // No plan yet: the original video, so the user can watch and pick moments first.
    <Flex vertical style={{ height: "100%" }}>
      <Flex justify="center" gap={8} style={{ padding: "8px 8px 0" }}>
        <SpeakerToggle />
        {p.assets.source_url ? <QualityToggle /> : null}
      </Flex>
      <div style={{ flex: 1, minHeight: 0 }}>
        <SourcePlayer
          proxyUrl={p.assets.proxy_url}
          sourceUrl={p.assets.source_url}
          transcript={transcript.data}
          durationS={p.duration_s ?? 0}
          speaker={speaker.data}
        />
      </div>
    </Flex>
  );

  const transcriptTab = (
    <TranscriptPanel
      projectId={projectId}
      title={p.title}
      edl={edl ?? null}
      transcript={transcript.data}
      loading={transcript.isLoading && !!p.assets.transcript_url}
      error={transcript.error}
      onRetry={() => transcript.refetch()}
      canEdit={canEdit}
    />
  );

  return (
    <Flex vertical style={{ height: "100%" }}>
      <PageHeader
        title={p.title}
        extra={
          <Flex gap={8} align="center" wrap>
            <Tag color={chip.color}>
              {chip.text}
              {chip.active && chip.percent !== undefined ? ` ${Math.round(chip.percent)}%` : ""}
            </Tag>
            {edl ? <SaveState projectId={projectId} /> : null}
            <Button type="primary" icon={<ExportOutlined />} disabled={!edl} onClick={() => setExportOpen(true)}>
              Export
            </Button>
          </Flex>
        }
      />
      {project.isError ? (
        <Alert type="warning" showIcon banner title="Can't refresh right now. Showing the last known state." />
      ) : null}
      {agentBusy && local.dirty ? (
        <Alert type="info" showIcon banner title="Clipora is updating the plan. Your edits are kept and you'll choose if they collide." />
      ) : null}
      <div style={{ flex: 1, minHeight: 0 }}>
        <Splitter orientation="vertical">
          <Splitter.Panel min="40%">
            <Splitter>
              <Splitter.Panel defaultSize="38%" min={300}>
                <Flex vertical style={{ height: "100%" }}>
                  <Tabs
                    activeKey={tab}
                    onChange={setTab}
                    style={{ paddingInline: 8 }}
                    items={[
                      { key: "chat", label: "Chat" },
                      {
                        key: "videos",
                        label: shorts.length ? `Edited videos (${shorts.length})` : "Edited videos",
                      },
                      { key: "transcript", label: "Transcript" },
                      { key: "metadata", label: "Title & hashtags" },
                    ]}
                  />
                  {/* All stay mounted so a half-typed message survives switching tabs. */}
                  <div style={{ flex: 1, minHeight: 0, display: tab === "chat" ? "block" : "none" }}>
                    <ChatPanel project={p} />
                  </div>
                  <div style={{ flex: 1, minHeight: 0, display: tab === "videos" ? "block" : "none" }}>
                    <GeneratedVideosPanel
                      projectId={projectId}
                      currentVersion={p.current_version}
                      thumbnails={p.assets.thumbnails}
                    />
                  </div>
                  <div style={{ flex: 1, minHeight: 0, display: tab === "transcript" ? "block" : "none" }}>
                    {transcriptTab}
                  </div>
                  <div style={{ flex: 1, minHeight: 0, display: tab === "metadata" ? "block" : "none" }}>
                    <MetadataPanel projectId={projectId} hasPlan={p.current_version > 0} title={p.title} />
                  </div>
                </Flex>
              </Splitter.Panel>
              <Splitter.Panel min={320}>{planArea}</Splitter.Panel>
            </Splitter>
          </Splitter.Panel>
          <Splitter.Panel defaultSize={220} min={160} max="50%">
            {edl ? (
              <Timeline
                projectId={projectId}
                edl={edl}
                transcript={transcript.data}
                wordBounds={bounds}
                waveform={waveform.data}
                thumbnails={p.assets.thumbnails}
                canEdit={canEdit}
                speaker={showSpeaker ? speaker.data : undefined}
              />
            ) : p.status === "ready" && p.duration_s ? (
              <SourceTimeline
                durationS={p.duration_s}
                waveform={waveform.data}
                thumbnails={p.assets.thumbnails}
                speaker={showSpeaker ? speaker.data : undefined}
              />
            ) : (
              <Flex align="center" justify="center" style={{ height: "100%" }}>
                <Typography.Text type="secondary">The timeline appears when your video is ready.</Typography.Text>
              </Flex>
            )}
          </Splitter.Panel>
        </Splitter>
      </div>
      <ExportDrawer
        project={p}
        open={exportOpen}
        onClose={() => setExportOpen(false)}
        outputSeconds={total}
        unsaved={local.dirty || local.saving}
        onWriteMetadata={() => {
          setExportOpen(false);
          setTab("metadata");
        }}
      />
      <ConflictModal projectId={projectId} />
    </Flex>
  );
}
