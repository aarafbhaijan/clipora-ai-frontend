"use client";
// Transcript panel (design.md "Transcript panel"): cues with SRT timecodes, click a cue or a word to seek,
// double-click to fix a caption, search, follow playback, add selected lines to the edit, download SRT.
import { AimOutlined, DownloadOutlined, PlusOutlined } from "@ant-design/icons";
import { App, Button, Empty, Flex, Input, Skeleton, Table, theme, Tooltip, Typography } from "antd";
import type { GetRef } from "antd";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api, errorMessage, unwrap } from "@/api/client";
import type { EDL } from "@/api/types";
import { addSegment, setCaptionEdit } from "@/lib/edlOps";
import { useEditor } from "@/lib/editorStore";
import { srtTime } from "@/lib/format";
import { usePlayer } from "@/lib/playerStore";
import { segmentTimings, srcToOut } from "@/lib/timemap";
import { cueAt, downloadText, toSrt, type Cue, type Transcript } from "@/lib/transcript";

const ROW_H = 56;

interface Props {
  projectId: string;
  title: string;
  edl: EDL | null;
  transcript: Transcript | undefined;
  loading: boolean;
  error: unknown;
  onRetry: () => void;
  canEdit: boolean;
}

export default function TranscriptPanel({ projectId, title, edl, transcript, loading, error, onRetry, canEdit }: Props) {
  const { token } = theme.useToken();
  const { message } = App.useApp();
  const edit = useEditor((s) => s.edit);
  const tOut = usePlayer((s) => s.tOut);
  const segIndex = usePlayer((s) => s.segIndex);
  const sourceMode = usePlayer((s) => s.sourceMode);
  const sourceTime = usePlayer((s) => s.sourceTime);
  const seekOut = usePlayer((s) => s.seekOut);
  const seekSource = usePlayer((s) => s.seekSource);
  const tableRef = useRef<GetRef<typeof Table>>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState(300);
  const [follow, setFollow] = useState(true);
  const [selected, setSelected] = useState<string[]>([]);
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [hover, setHover] = useState<string | null>(null);
  const [searching, setSearching] = useState(false);

  const cues = useMemo(() => transcript?.cues ?? [], [transcript]);
  const edits = edl?.captions?.edits ?? {};
  const timings = useMemo(() => (edl ? segmentTimings(edl) : []), [edl]);

  // Source time now playing.
  const srcNow = sourceMode
    ? sourceTime
    : timings[segIndex]
      ? timings[segIndex].srcStart + (tOut - timings[segIndex].tOutStart)
      : 0;
  const active = cueAt(cues, srcNow);
  const activeIndex = active ? cues.indexOf(active) : -1;

  // The list fills all the height it is given. A callback ref measures the list area whenever it appears (it does
  // not exist while the transcript loads) and keeps measuring: in a hidden tab it is 0 high until shown.
  const listObserver = useRef<ResizeObserver | null>(null);
  const listRef = useCallback((el: HTMLDivElement | null) => {
    listObserver.current?.disconnect();
    listObserver.current = null;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      if (el.clientHeight > 0) setHeight(el.clientHeight);
    });
    ro.observe(el);
    listObserver.current = ro;
  }, []);

  useEffect(() => {
    if (follow && activeIndex >= 0) tableRef.current?.scrollTo({ index: activeIndex });
  }, [follow, activeIndex]);

  const inEdit = (c: Cue) => !!edl?.segments.some((s) => c.end > s.src_start && c.start < s.src_end);

  const seekTo = (src: number) => {
    const t = edl ? srcToOut(edl, src, timings) : null;
    if (t !== null) seekOut(t);
    else seekSource(src);
  };

  const saveEdit = (c: Cue) => {
    const text = draft.trim();
    edit(projectId, (d) => setCaptionEdit(d as EDL, c.id, !text || text === c.text ? null : text));
    setEditing(null);
  };

  const addSelected = () => {
    const picked = cues.filter((c) => selected.includes(c.id));
    if (!picked.length || !edl) return;
    const start = Math.min(...picked.map((c) => c.start));
    const end = Math.max(...picked.map((c) => c.end));
    const after = timings.findIndex((t) => t.tOutStart <= tOut && tOut < t.tOutEnd);
    edit(projectId, (d) => void addSegment(d as EDL, start, end, after >= 0 ? after + 1 : d.segments.length));
    setSelected([]);
    message.success("Added to your clips.");
  };

  const search = async (q: string) => {
    if (!q.trim()) return;
    setSearching(true);
    try {
      const hits = await unwrap(
        api.GET("/api/projects/{project_id}/search", { params: { path: { project_id: projectId }, query: { q } } }),
      );
      const first = hits[0];
      if (!first) {
        message.info("No lines match.");
        return;
      }
      const idx = cues.findIndex((c) => c.id === first.cue_from);
      setFollow(false);
      if (idx >= 0) tableRef.current?.scrollTo({ index: idx });
      seekTo(first.start_s);
    } catch (e) {
      // Fall back to a plain text search in the loaded transcript.
      const idx = cues.findIndex((c) => (edits[c.id] ?? c.text).toLowerCase().includes(q.toLowerCase()));
      if (idx >= 0) {
        setFollow(false);
        tableRef.current?.scrollTo({ index: idx });
        seekTo(cues[idx].start);
      } else message.error(errorMessage(e));
    } finally {
      setSearching(false);
    }
  };

  if (loading) return <Skeleton active style={{ padding: 12 }} />;
  if (error)
    return (
      <Flex vertical align="center" gap={8} style={{ padding: 16 }}>
        <Typography.Text type="secondary">Couldn&apos;t load the transcript.</Typography.Text>
        <Button size="small" onClick={onRetry}>
          Retry
        </Button>
      </Flex>
    );
  if (!cues.length) return <Empty description="The transcript appears when the video is ready." style={{ padding: 16 }} />;

  return (
    <div ref={boxRef} style={{ height: "100%", display: "flex", flexDirection: "column" }}>
      <Flex gap={6} align="center" style={{ padding: 8 }}>
        <Input.Search placeholder="Search the transcript" allowClear loading={searching} onSearch={search} size="small" />
        {!follow ? (
          <Tooltip title="Follow playback">
            <Button size="small" icon={<AimOutlined />} onClick={() => setFollow(true)}>
              Follow
            </Button>
          </Tooltip>
        ) : null}
        <Tooltip title="Add the selected lines to your clips">
          <Button size="small" icon={<PlusOutlined />} disabled={!selected.length || !canEdit} onClick={addSelected}>
            Add to edit
          </Button>
        </Tooltip>
        <Tooltip title="Download subtitles (.srt)">
          <Button
            size="small"
            icon={<DownloadOutlined />}
            aria-label="Download SRT"
            onClick={() => downloadText(`${title || "transcript"}.srt`, toSrt(cues, edits), "application/x-subrip")}
          />
        </Tooltip>
      </Flex>
      <div
        ref={listRef}
        onWheel={() => setFollow(false)}
        onKeyDown={(e) => {
          if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
          e.preventDefault();
          const i = Math.max(0, Math.min(cues.length - 1, activeIndex + (e.key === "ArrowDown" ? 1 : -1)));
          seekTo(cues[i].start);
        }}
        tabIndex={0}
        aria-label="Transcript. Use up and down to move between lines."
        style={{ flex: 1, minHeight: 0, outline: "none" }}
      >
        <Table<Cue>
          ref={tableRef}
          virtual
          size="small"
          showHeader={false}
          pagination={false}
          rowKey="id"
          dataSource={cues}
          scroll={{ y: height }}
          rowSelection={
            canEdit
              ? { selectedRowKeys: selected, onChange: (keys) => setSelected(keys as string[]), columnWidth: 32 }
              : undefined
          }
          onRow={(c) => ({
            onClick: () => seekTo(c.start),
            onDoubleClick: () => {
              if (!canEdit) return;
              setEditing(c.id);
              setDraft(edits[c.id] ?? c.text);
            },
            onMouseEnter: () => setHover(c.id),
            onMouseLeave: () => setHover((h) => (h === c.id ? null : h)),
            style: {
              height: ROW_H,
              cursor: "pointer",
              background: c.id === active?.id ? token.colorPrimaryBg : undefined,
              opacity: inEdit(c) ? 1 : 0.5,
            },
          })}
          columns={[
            {
              key: "time",
              width: 104,
              render: (_, c) => (
                <Typography.Text type="secondary" style={{ fontSize: 11, fontVariantNumeric: "tabular-nums" }}>
                  {srtTime(c.start)}
                  <br />
                  {srtTime(c.end)}
                </Typography.Text>
              ),
            },
            {
              key: "text",
              render: (_, c) => {
                if (editing === c.id)
                  return (
                    <Input.TextArea
                      autoFocus
                      autoSize={{ minRows: 1, maxRows: 2 }}
                      value={draft}
                      onClick={(e) => e.stopPropagation()}
                      onChange={(e) => setDraft(e.target.value)}
                      onBlur={() => saveEdit(c)}
                      onKeyDown={(e) => {
                        e.stopPropagation();
                        if (e.key === "Enter" && !e.shiftKey) {
                          e.preventDefault();
                          saveEdit(c);
                        }
                        if (e.key === "Escape") setEditing(null);
                      }}
                    />
                  );
                const showWords = (c.id === active?.id || c.id === hover) && c.words.length && !edits[c.id];
                if (showWords)
                  return (
                    <span>
                      {c.words.map((w, i) => (
                        <span
                          key={i}
                          role="button"
                          tabIndex={-1}
                          onClick={(e) => {
                            e.stopPropagation();
                            seekTo(w.start);
                          }}
                          style={{
                            cursor: "pointer",
                            borderRadius: 3,
                            background: srcNow >= w.start && srcNow < w.end ? token.colorPrimaryBgHover : undefined,
                          }}
                        >
                          {w.text}{" "}
                        </span>
                      ))}
                    </span>
                  );
                return (
                  <Typography.Text>
                    {edits[c.id] ?? c.text}
                    {edits[c.id] ? (
                      <Typography.Text type="secondary" style={{ fontSize: 11 }}>
                        {" "}
                        (edited)
                      </Typography.Text>
                    ) : null}
                  </Typography.Text>
                );
              },
            },
          ]}
        />
      </div>
    </div>
  );
}
