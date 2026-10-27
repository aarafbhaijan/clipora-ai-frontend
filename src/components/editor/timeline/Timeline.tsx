"use client";
// Timeline (design.md section 6, custom parts per section 9). Toolbar, ruler in output time, then one block per
// clip spanning the audio track (its waveform) and the video track (its thumbnails), transition badges on the
// boundaries, and a compact source row for the whole video: chosen ranges filled, unused moments dashed.
import {
  CheckOutlined,
  DeleteOutlined,
  EditOutlined,
  EyeOutlined,
  PlusOutlined,
  RedoOutlined,
  SaveOutlined,
  ScissorOutlined,
  SwapOutlined,
  UndoOutlined,
  UnorderedListOutlined,
} from "@ant-design/icons";
import {
  Button,
  Divider,
  Flex,
  Segmented,
  theme,
  Tooltip,
  Typography,
} from "antd";
import {
  Fragment,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { Candidate, EDL, SpeakerOut, Thumbnails } from "@/api/types";
import { usePointerDrag } from "@/hooks/usePointerDrag";
import type { Waveform } from "@/hooks/useMedia";
import {
  addSegment,
  moveSegment,
  removeSegment,
  setTransition,
  splitAt,
  trimSegment,
} from "@/lib/edlOps";
import { useEditor, useProjectEdit } from "@/lib/editorStore";
import { clock } from "@/lib/format";
import { usePlayer } from "@/lib/playerStore";
import {
  boundaries,
  effectiveDuration,
  outputDuration,
  segmentTimings,
} from "@/lib/timemap";
import { snapTo, type Transcript } from "@/lib/transcript";
import { SPEC } from "@/lib/transitions";
import CandidatesDrawer from "./CandidatesDrawer";
import EffectPicker from "./EffectPicker";
import {
  AUDIO_H,
  drawWave,
  HoverCursor,
  Playhead,
  prepareCanvas,
  Ruler,
  RULER_H,
  Tile,
  TimeReadout,
  tileWidth,
  TrackLabels,
  TrackLines,
  useViewWidth,
  useFitZoom,
  THIN_SCROLL_CLASS,
  ThinScrollbarStyle,
  VIDEO_H,
  ZoomControl,
} from "./shared";
import SpeakerLane, { SpeakerLaneLabel } from "./SpeakerLane";

// Kept for other importers; the implementations live in ./timeline/shared.
export { rulerStep, tileStyle } from "./shared";

const SNAP_S = 0.15;
const GAP = 4; // px between clip blocks
const SOURCE_ROW_H = 30;
const TRACKS_H = RULER_H + AUDIO_H + VIDEO_H + 1;
const BLOCK_TOP = RULER_H + 2;
const BLOCK_H = AUDIO_H + VIDEO_H - 4;
const MAX_TILES = 80;
const TRANSITION_D = 22; // transition badge diameter

interface Props {
  projectId: string;
  edl: EDL;
  transcript: Transcript | undefined;
  wordBounds: number[];
  waveform: Waveform | undefined;
  thumbnails: Thumbnails | null | undefined;
  canEdit: boolean;
  /** Who talks when; the Speakers lane shows while the speaker boxes are on. */
  speaker?: SpeakerOut;
}

interface Block {
  index: number;
  id: string;
  srcStart: number;
  srcEnd: number;
  tOutStart: number;
  /** Visible part in output time: neighbours meet in the middle of each transition overlap. */
  visStart: number;
  visEnd: number;
}

export default function Timeline({
  projectId,
  edl,
  transcript,
  wordBounds,
  waveform,
  thumbnails,
  canEdit,
  speaker,
}: Props) {
  const { token } = theme.useToken();
  const edit = useEditor((s) => s.edit);
  const undo = useEditor((s) => s.undo);
  const redo = useEditor((s) => s.redo);
  const canUndo = useEditor((s) => (s.byId[projectId]?.past.length ?? 0) > 0);
  const canRedo = useEditor((s) => (s.byId[projectId]?.future.length ?? 0) > 0);
  const tOut = usePlayer((s) => s.tOut);
  const playing = usePlayer((s) => s.playing);
  const selectedId = usePlayer((s) => s.selectedId);
  const highlights = usePlayer((s) => s.highlights);
  const sourceMode = usePlayer((s) => s.sourceMode);
  const sourceTime = usePlayer((s) => s.sourceTime);
  const segIndex = usePlayer((s) => s.segIndex);
  const setPlayer = usePlayer((s) => s.set);
  const seekOut = usePlayer((s) => s.seekOut);
  const seekSource = usePlayer((s) => s.seekSource);

  // View: click or drag anywhere (also on clips) to land on an exact frame. Edit: select, trim, reorder clips.
  const mode = usePlayer((s) => s.timelineMode);
  const setMode = (m: "view" | "edit") => setPlayer({ timelineMode: m });
  const editing = canEdit && mode === "edit";
  const { dirty, saving, saveError } = useProjectEdit(projectId);
  const patchMeta = useEditor((s) => s.patchMeta);
  // While a trim is dragged the plan's length changes; the fitted scale stays put until it ends.
  const [frozenTotal, setFrozenTotal] = useState<number | null>(null);
  const [scrollLeft, setScrollLeft] = useState(0);
  const [drawer, setDrawer] = useState(false);
  const [trimDraft, setTrimDraftState] = useState<{
    id: string;
    src_start: number;
    src_end: number;
  } | null>(null);
  const trimRef = useRef<typeof trimDraft>(null);
  const setTrimDraft = (d: typeof trimDraft) => {
    if (d && !trimRef.current) setFrozenTotal(outputDuration(edl));
    if (!d) setFrozenTotal(null);
    trimRef.current = d;
    setTrimDraftState(d);
  };
  const [dragMove, setDragMove] = useState<{ id: string; dx: number } | null>(
    null,
  );
  const [candDrag, setCandDrag] = useState<{
    c: Candidate;
    x: number;
    y: number;
  } | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const waveRef = useRef<HTMLCanvasElement>(null);
  const laneRef = useRef<HTMLDivElement>(null);
  const viewW = useViewWidth(scrollRef);

  // The plan as drawn: with an in-progress trim applied, without touching undo history.
  const shown = useMemo(() => {
    if (!trimDraft) return edl;
    return {
      ...edl,
      segments: edl.segments.map((s) =>
        s.id === trimDraft.id ? { ...s, ...trimDraft } : s,
      ),
    };
  }, [edl, trimDraft]);
  const timings = useMemo(() => segmentTimings(shown), [shown]);
  const trans = useMemo(() => boundaries(shown), [shown]);
  const total = useMemo(() => outputDuration(shown), [shown]);
  const blocks = useMemo<Block[]>(
    () =>
      timings.map((st, i) => ({
        index: st.index,
        id: st.id,
        srcStart: st.srcStart,
        srcEnd: st.srcEnd,
        tOutStart: st.tOutStart,
        visStart:
          st.tOutStart + (i > 0 ? effectiveDuration(trans[i - 1]) / 2 : 0),
        visEnd:
          st.tOutEnd - (i < trans.length ? effectiveDuration(trans[i]) / 2 : 0),
      })),
    [timings, trans],
  );
  // Fitted to the width by default (a 30 s or 40 s plan fills it); zooming widens it with a horizontal scroll.
  const zoom = useFitZoom(scrollRef, frozenTotal ?? total, viewW);
  const pps = zoom.pps;
  const contentW = Math.max(zoom.contentWidth, total * pps + 16);
  const candidates = edl.meta?.candidates ?? [];
  const full = edl.segments.length >= 30;
  const selectedIndex = edl.segments.findIndex((s) => s.id === selectedId);
  const anySelected = selectedIndex >= 0;
  const dragDx = (id: string) => (dragMove?.id === id ? dragMove.dx : 0);

  // Keep this time under its current screen position when zooming (centre it if it is off screen).
  const anchorAt = (t: number) => {
    const el = scrollRef.current;
    const x = t * pps - (el?.scrollLeft ?? 0);
    return { t, x: x < 0 || x > viewW ? viewW / 2 : x };
  };

  // Keep the playhead in view while playing (not while the user scrolls around a paused plan).
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || !playing || sourceMode) return;
    const x = tOut * pps;
    if (x < el.scrollLeft || x > el.scrollLeft + el.clientWidth - 40)
      el.scrollLeft = Math.max(0, x - 80);
  }, [tOut, pps, playing, sourceMode]);

  // Audio track: each clip's source waveform inside its block, visible window only.
  useEffect(() => {
    const c = waveRef.current;
    if (!c) return;
    const ctx = prepareCanvas(c, viewW, AUDIO_H);
    if (!ctx || !waveform) return;
    for (const b of blocks) {
      const dx = dragDx(b.id);
      const x0 = b.visStart * pps + GAP / 2 + dx - scrollLeft;
      const x1 = b.visEnd * pps - GAP / 2 + dx - scrollLeft;
      if (x1 < 0 || x0 > viewW) continue;
      const selected = b.id === selectedId;
      ctx.globalAlpha = anySelected && !selected ? 0.45 : 1;
      ctx.fillStyle = selected ? token.colorPrimary : token.colorTextSecondary;
      drawWave(
        ctx,
        waveform,
        Math.max(0, x0 + 2),
        Math.min(viewW, x1 - 2),
        (x) => b.srcStart + (x + scrollLeft - dx) / pps - b.tOutStart,
        4,
        AUDIO_H - 6,
      );
    }
    ctx.globalAlpha = 1;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    waveform,
    blocks,
    pps,
    scrollLeft,
    viewW,
    selectedId,
    anySelected,
    dragMove,
    token.colorPrimary,
    token.colorTextSecondary,
  ]);

  const snap = useCallback(
    (t: number, shift: boolean) => (shift ? t : snapTo(t, wordBounds, SNAP_S)),
    [wordBounds],
  );

  // Trim handles.
  const startTrim = usePointerDrag<{
    id: string;
    edge: "start" | "end";
    start: number;
    end: number;
  }>({
    onStart: (d) => setPlayer({ selectedId: d.id }),
    onMove: (d, i) => {
      const dt = i.dx / pps;
      const dur = edl.source.duration_s;
      if (d.edge === "start") {
        const s = Math.max(
          0,
          Math.min(snap(d.start + dt, i.shiftKey), d.end - 1),
        );
        setTrimDraft({ id: d.id, src_start: s, src_end: d.end });
      } else {
        const e = Math.min(
          dur,
          Math.max(snap(d.end + dt, i.shiftKey), d.start + 1),
        );
        setTrimDraft({ id: d.id, src_start: d.start, src_end: e });
      }
    },
    onEnd: (d, _i, moved) => {
      const draft = trimRef.current;
      setTrimDraft(null);
      if (moved && draft)
        edit(projectId, (x) =>
          trimSegment(x as EDL, d.id, {
            src_start: draft.src_start,
            src_end: draft.src_end,
          }),
        );
    },
  });

  // Click a block to select it and seek; drag its body to reorder.
  const startMove = usePointerDrag<{ id: string }>({
    onMove: (d, i) => setDragMove({ id: d.id, dx: i.dx }),
    onEnd: (d, i, moved) => {
      setDragMove(null);
      const st = timings.find((t) => t.id === d.id);
      if (!moved) {
        setPlayer({ selectedId: d.id });
        if (st) seekOut(st.tOutStart + 0.001);
        return;
      }
      if (!st) return;
      const center = ((st.tOutStart + st.tOutEnd) / 2) * pps + i.dx;
      const to = timings.filter(
        (t) => t.id !== d.id && ((t.tOutStart + t.tOutEnd) / 2) * pps < center,
      ).length;
      if (to !== st.index)
        edit(projectId, (x) => moveSegment(x as EDL, d.id, to));
    },
  });

  // Drag a dashed candidate from the source row onto the clips.
  const startCandidate = usePointerDrag<Candidate>({
    onMove: (c, i) => setCandDrag({ c, x: i.clientX, y: i.clientY }),
    onEnd: (c, i, moved) => {
      setCandDrag(null);
      if (!moved) return seekSource(c.src_start);
      const lane = laneRef.current?.getBoundingClientRect();
      if (!lane || i.clientY < lane.top || i.clientY > lane.bottom || full)
        return;
      const x = i.clientX - lane.left;
      const at = timings.filter(
        (t) => ((t.tOutStart + t.tOutEnd) / 2) * pps < x,
      ).length;
      edit(
        projectId,
        (d) => void addSegment(d as EDL, c.src_start, c.src_end, at),
      );
    },
  });

  const nudge = (id: string, edge: "start" | "end", dir: 1 | -1) => {
    const s = edl.segments.find((x) => x.id === id);
    if (!s) return;
    const t = edge === "start" ? s.src_start : s.src_end;
    const next =
      dir > 0
        ? wordBounds.find((b) => b > t + 1e-3)
        : [...wordBounds].reverse().find((b) => b < t - 1e-3);
    const value = next ?? t + dir * 0.1;
    edit(projectId, (d) =>
      trimSegment(
        d as EDL,
        id,
        edge === "start" ? { src_start: value } : { src_end: value },
      ),
    );
  };

  const scrubTo = (clientX: number) => {
    const el = contentRef.current;
    if (!el) return;
    seekOut(
      Math.max(
        0,
        Math.min(
          total - 0.001,
          (clientX - el.getBoundingClientRect().left) / pps,
        ),
      ),
    );
  };

  const srcDur = edl.source.duration_s || 1;
  const srcPct = (t: number) => `${(t / srcDur) * 100}%`;
  // Source time on screen: the playhead in the source, or inside the clip being played.
  const srcNow = sourceMode
    ? sourceTime
    : (timings[segIndex]?.srcStart ?? 0) + (tOut - (timings[segIndex]?.tOutStart ?? 0));
  const showLane = !!speaker?.turns?.length;
  const readout = sourceMode ? sourceTime : tOut;

  const pill = { borderRadius: 999, paddingInline: token.paddingSM } as const;

  return (
    <Flex vertical style={{ height: "100%", minHeight: 0 }}>
      {/* Toolbar */}
      <Flex
        align="center"
        gap={token.paddingXS}
        style={{
          padding: `${token.paddingXXS}px ${token.paddingSM}px`,
          borderBottom: `1px solid ${token.colorBorderSecondary}`,
        }}
      >
        <TimeReadout t={readout} />
        <Segmented
          size="small"
          value={mode}
          onChange={(v) => {
            setMode(v as "view" | "edit");
            if (v === "view") setPlayer({ selectedId: null });
          }}
          options={[
            {
              value: "view",
              icon: <EyeOutlined />,
              label: "View",
              title: "Click or drag to go to any frame",
            },
            {
              value: "edit",
              icon: <EditOutlined />,
              label: "Edit",
              title: "Select, trim and reorder clips",
              disabled: !canEdit,
            },
          ]}
          aria-label="Timeline mode"
        />
        <Tooltip title="Undo (Ctrl/Cmd+Z)">
          <Button
            size="small"
            icon={<UndoOutlined />}
            disabled={!canUndo}
            onClick={() => undo(projectId)}
            style={pill}
          >
            Undo
          </Button>
        </Tooltip>
        <Tooltip title="Redo (Shift+Ctrl/Cmd+Z)">
          <Button
            size="small"
            icon={<RedoOutlined />}
            disabled={!canRedo}
            onClick={() => redo(projectId)}
            style={pill}
          >
            Redo
          </Button>
        </Tooltip>
        <Divider
          orientation="vertical"
          style={{ marginInline: token.marginXXS }}
        />
        <Tooltip title="Split at the playhead (S)">
          <Button
            size="small"
            type="text"
            icon={<ScissorOutlined />}
            disabled={!editing}
            onClick={() => edit(projectId, (d) => void splitAt(d as EDL, tOut))}
            aria-label="Split at the playhead"
          />
        </Tooltip>
        <Tooltip title="Remove the selected clip (Delete)">
          <Button
            size="small"
            type="text"
            icon={<DeleteOutlined />}
            disabled={!editing || !anySelected || edl.segments.length <= 1}
            onClick={() =>
              selectedId &&
              edit(projectId, (d) => removeSegment(d as EDL, selectedId))
            }
            aria-label="Remove the selected clip"
          />
        </Tooltip>
        <Tooltip title="Add a moment the AI did not use">
          <Button
            size="small"
            type="text"
            icon={<PlusOutlined />}
            disabled={!editing}
            onClick={() => setDrawer(true)}
            aria-label="Add a moment"
          >
            {candidates.length ? `${candidates.length}` : null}
          </Button>
        </Tooltip>
        <Typography.Text
          type="secondary"
          style={{
            flex: 1,
            textAlign: "center",
            fontSize: token.fontSizeSM,
            fontVariantNumeric: "tabular-nums",
          }}
        >
          {edl.segments.length} clips · {clock(total, true)}
        </Typography.Text>
        <Tooltip
          title={
            saveError
              ? `${saveError} Click to try again.`
              : dirty || saving
                ? "Changes save automatically a moment after you edit."
                : "All changes are saved."
          }
        >
          <Button
            size="small"
            type={saveError ? "primary" : "default"}
            danger={!!saveError}
            icon={
              dirty || saving || saveError ? (
                <SaveOutlined />
              ) : (
                <CheckOutlined />
              )
            }
            loading={saving}
            disabled={!dirty && !saveError}
            // Autosave runs 800 ms after each edit; after a failed save, clearing the error makes it retry now.
            onClick={() => patchMeta(projectId, { saveError: null })}
            style={pill}
          >
            {saving
              ? "Saving"
              : saveError
                ? "Retry save"
                : dirty
                  ? "Save"
                  : "Saved"}
          </Button>
        </Tooltip>
        <ZoomControl
          zoom={zoom.zoom}
          onZoomTo={(z) => zoom.zoomTo(z, anchorAt(tOut))}
          onStep={(f) => zoom.zoomAroundTime(f, tOut)}
          onFit={zoom.fit}
        />
      </Flex>

      <Flex style={{ flex: 1, minHeight: 0 }}>
        <TrackLabels
          extra={
            <>
            <Tooltip
              title="Whole video: filled = in your short, dashed = unused moments (drag one onto the clips)"
              placement="right"
            >
              <Flex
                align="center"
                justify="center"
                style={{
                  height: SOURCE_ROW_H,
                  color: token.colorTextSecondary,
                }}
              >
                <UnorderedListOutlined />
              </Flex>
            </Tooltip>
            {showLane ? <SpeakerLaneLabel /> : null}
            </>
          }
        />
        <Flex vertical style={{ flex: 1, minWidth: 0 }}>
          <ThinScrollbarStyle />
          <div
            ref={scrollRef}
            className={THIN_SCROLL_CLASS}
            onScroll={(e) => setScrollLeft(e.currentTarget.scrollLeft)}
            style={{
              overflowX: "auto",
              overflowY: "hidden",
              position: "relative",
              flexShrink: 0,
            }}
          >
            <div
              ref={contentRef}
              style={{
                width: contentW,
                position: "relative",
                height: TRACKS_H,
                cursor: editing ? "default" : "col-resize",
              }}
              onPointerDown={(e) => {
                // View mode scrubs from anywhere; edit mode only from empty space (clips handle their own drags).
                if (e.button !== 0 || (editing && e.target !== e.currentTarget))
                  return;
                e.currentTarget.setPointerCapture(e.pointerId);
                scrubTo(e.clientX);
              }}
              onPointerMove={(e) => {
                if (
                  e.buttons & 1 &&
                  e.currentTarget.hasPointerCapture(e.pointerId)
                )
                  scrubTo(e.clientX);
              }}
            >
              <TrackLines width={contentW} />
              <Ruler
                pps={pps}
                scrollLeft={scrollLeft}
                viewW={viewW}
                max={total}
              />
              <canvas
                ref={waveRef}
                aria-hidden
                style={{
                  position: "absolute",
                  left: scrollLeft,
                  top: RULER_H,
                  width: viewW,
                  height: AUDIO_H,
                  pointerEvents: "none",
                  zIndex: 0,
                }}
              />

              {/* Clips: one block across the audio and video tracks */}
              <div
                ref={laneRef}
                role="list"
                aria-label="Clips in your short"
                style={{
                  position: "absolute",
                  left: 0,
                  top: BLOCK_TOP,
                  width: contentW,
                  height: BLOCK_H,
                  pointerEvents: "none",
                  zIndex: 1,
                }}
              >
                {blocks.map((b) => {
                  const seg = shown.segments[b.index];
                  const selected = seg.id === selectedId;
                  const dx = dragDx(seg.id);
                  const left = b.visStart * pps + GAP / 2 + dx;
                  const width = Math.max(
                    8,
                    (b.visEnd - b.visStart) * pps - GAP,
                  );
                  const tw = thumbnails
                    ? tileWidth(thumbnails, VIDEO_H - 4)
                    : 0;
                  const nTiles = thumbnails
                    ? Math.min(MAX_TILES, Math.max(1, Math.ceil(width / tw)))
                    : 0;
                  const offset = b.visStart - b.tOutStart; // seconds of the clip hidden under the previous transition
                  return (
                    <div
                      key={seg.id}
                      role="listitem"
                      tabIndex={0}
                      aria-label={`Clip ${b.index + 1}: ${clock(seg.src_start)} to ${clock(seg.src_end)} in the source, ${(seg.src_end - seg.src_start).toFixed(1)} seconds${seg.reason ? `, ${seg.reason}` : ""}. Arrow keys trim the end, Shift+Arrow the start.`}
                      onPointerDown={
                        editing ? startMove({ id: seg.id }) : undefined
                      }
                      onFocus={() =>
                        editing && setPlayer({ selectedId: seg.id })
                      }
                      onKeyDown={(e) => {
                        if (!editing) return;
                        if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
                          e.preventDefault();
                          e.stopPropagation();
                          nudge(
                            seg.id,
                            e.shiftKey ? "start" : "end",
                            e.key === "ArrowRight" ? 1 : -1,
                          );
                        }
                      }}
                      style={{
                        position: "absolute",
                        left,
                        width,
                        top: 0,
                        height: BLOCK_H,
                        pointerEvents: editing ? "auto" : "none",
                        cursor: "grab",
                        zIndex: dragMove?.id === seg.id ? 6 : selected ? 4 : 1,
                        outline: "none",
                      }}
                    >
                      <div
                        style={{
                          position: "absolute",
                          inset: 0,
                          borderRadius: token.borderRadius,
                          border: `${selected ? 2 : 1}px solid ${selected ? token.colorPrimary : token.colorBorder}`,
                          overflow: "hidden",
                          opacity:
                            anySelected && !selected
                              ? 0.6
                              : dragMove?.id === seg.id
                                ? 0.85
                                : 1,
                          boxShadow: selected
                            ? token.boxShadowSecondary
                            : undefined,
                        }}
                      >
                        {/* Audio half: the waveform canvas shows through */}
                        <div
                          style={{
                            height: AUDIO_H - 2,
                            background: token.colorFillQuaternary,
                          }}
                        />
                        {/* Video half */}
                        <div
                          aria-hidden
                          style={{
                            position: "relative",
                            height: VIDEO_H - 4,
                            background: token.colorFillSecondary,
                            borderTop: `1px solid ${token.colorBorderSecondary}`,
                            overflow: "hidden",
                          }}
                        >
                          {thumbnails
                            ? Array.from({ length: nTiles }, (_, k) => (
                                <Tile
                                  key={k}
                                  t={thumbnails}
                                  time={Math.min(
                                    seg.src_end,
                                    seg.src_start +
                                      offset +
                                      ((k + 0.5) * tw) / pps,
                                  )}
                                  left={k * tw}
                                  width={tw}
                                  height={VIDEO_H - 4}
                                />
                              ))
                            : null}
                        </div>
                      </div>
                      {/* Label chip */}
                      <div
                        aria-hidden
                        style={{
                          position: "absolute",
                          left: 6,
                          top: 4,
                          zIndex: 3,
                          padding: `0 ${token.paddingXXS + 2}px`,
                          borderRadius: token.borderRadiusXS,
                          background: token.colorBgMask,
                          color: token.colorTextLightSolid,
                          fontSize: token.fontSizeSM - 1,
                          lineHeight: "16px",
                          fontVariantNumeric: "tabular-nums",
                          whiteSpace: "nowrap",
                          maxWidth: Math.max(0, width - 12),
                          overflow: "hidden",
                          pointerEvents: "none",
                        }}
                      >
                        {b.index + 1} ·{" "}
                        {(seg.src_end - seg.src_start).toFixed(1)} s
                      </div>
                      {/* Trim handles: chunky grips on the selected clip, thin edges elsewhere */}
                      {editing
                        ? (["start", "end"] as const).map((edge) => (
                            <Tooltip
                              key={edge}
                              title={
                                edge === "start"
                                  ? "Drag to trim the start (Shift: no snapping)"
                                  : "Drag to trim the end (Shift: no snapping)"
                              }
                            >
                              <div
                                aria-hidden
                                onPointerDown={startTrim({
                                  id: seg.id,
                                  edge,
                                  start: seg.src_start,
                                  end: seg.src_end,
                                })}
                                style={{
                                  position: "absolute",
                                  top: selected ? -2 : 0,
                                  bottom: selected ? -2 : 0,
                                  [edge === "start" ? "left" : "right"]:
                                    selected ? -7 : 0,
                                  width: selected ? 14 : 8,
                                  zIndex: 5,
                                  cursor: "ew-resize",
                                  borderRadius: selected ? 7 : 0,
                                  background: selected
                                    ? token.colorPrimary
                                    : "transparent",
                                  display: "flex",
                                  alignItems: "center",
                                  justifyContent: "center",
                                }}
                              >
                                {selected ? (
                                  <div
                                    style={{
                                      width: 3,
                                      height: "38%",
                                      borderRadius: 2,
                                      background: token.colorBgContainer,
                                    }}
                                  />
                                ) : null}
                              </div>
                            </Tooltip>
                          ))
                        : null}
                    </div>
                  );
                })}

                {/* Transition badges on every boundary */}
                {trans.map((t, i) => {
                  const next = blocks[i + 1];
                  if (!next) return null;
                  const x = next.visStart * pps;
                  const from = blocks[i].id;
                  const to = next.id;
                  const cut = t.type === "cut";
                  const label = `${SPEC[t.type]?.label ?? t.type}${cut ? "" : `, ${t.duration_s.toFixed(1)} s`}`;
                  const badge = (
                    <Tooltip title={`${label}. Click to change.`}>
                      {/* Wrapper carries the position so the antd button keeps its own hover and focus styles */}
                      <span
                        style={{
                          position: "absolute",
                          left: x - TRANSITION_D / 2,
                          top: BLOCK_H / 2 - TRANSITION_D / 2,
                          zIndex: 7,
                          // View mode: clicks pass through to scrubbing.
                          pointerEvents: editing ? "auto" : "none",
                          lineHeight: 0,
                        }}
                      >
                        <Button
                          shape="circle"
                          size="small"
                          icon={cut ? <ScissorOutlined /> : <SwapOutlined />}
                          aria-label={`Transition between clip ${i + 1} and ${i + 2}: ${label}`}
                          tabIndex={editing ? 0 : -1}
                          style={{
                            width: TRANSITION_D,
                            minWidth: TRANSITION_D,
                            height: TRANSITION_D,
                            fontSize: token.fontSizeSM - 1,
                            color: cut
                              ? token.colorTextSecondary
                              : token.colorPrimary,
                            background: token.colorBgElevated,
                            borderColor: cut
                              ? token.colorBorder
                              : token.colorPrimaryBorder,
                            boxShadow: `0 0 0 3px ${token.colorBgContainer}, ${token.boxShadowTertiary}`,
                            cursor: editing ? "pointer" : "default",
                          }}
                        />
                      </span>
                    </Tooltip>
                  );
                  // The effect picker only exists in edit mode, so View never opens it.
                  return editing ? (
                    <EffectPicker
                      key={`${from}-${to}`}
                      value={t}
                      onApply={(type, dur, all) =>
                        edit(projectId, (d) =>
                          setTransition(
                            d as EDL,
                            all ? { all: true } : { from, to },
                            type,
                            dur,
                          ),
                        )
                      }
                    >
                      {badge}
                    </EffectPicker>
                  ) : (
                    <Fragment key={`${from}-${to}`}>{badge}</Fragment>
                  );
                })}
              </div>

              {!sourceMode ? (
                <Playhead x={tOut * pps} height={TRACKS_H} />
              ) : null}
              <HoverCursor
                target={contentRef}
                pps={pps}
                max={Math.max(total, 0.1)}
                height={TRACKS_H}
              />
            </div>
          </div>

          {/* Source row: the whole video */}
          <div
            style={{
              position: "relative",
              height: SOURCE_ROW_H,
              margin: `0 ${token.paddingSM}px 0 ${token.paddingXS}px`,
              borderTop: `1px solid ${token.colorBorderSecondary}`,
            }}
          >
            <div
              style={{
                position: "absolute",
                left: 0,
                right: 0,
                top: 6,
                bottom: 6,
                borderRadius: token.borderRadiusSM,
                background: token.colorFillQuaternary,
                cursor: "pointer",
              }}
              onClick={(e) => {
                if (e.target !== e.currentTarget) return;
                const rect = e.currentTarget.getBoundingClientRect();
                seekSource(((e.clientX - rect.left) / rect.width) * srcDur);
              }}
            >
              {edl.segments.map((s) => (
                <div
                  key={s.id}
                  aria-hidden
                  style={{
                    position: "absolute",
                    left: srcPct(s.src_start),
                    width: srcPct(s.src_end - s.src_start),
                    top: 3,
                    bottom: 3,
                    background:
                      s.id === selectedId
                        ? token.colorPrimary
                        : token.colorPrimaryBorder,
                    borderRadius: 2,
                    pointerEvents: "none",
                  }}
                />
              ))}
              {candidates.map((c, k) => (
                <Tooltip
                  key={k}
                  title={`${c.reason ?? "Another good moment"} · ${clock(c.src_start)}–${clock(c.src_end)}`}
                >
                  <div
                    role="button"
                    tabIndex={0}
                    aria-label={`Unused moment ${clock(c.src_start)} to ${clock(c.src_end)}`}
                    onPointerDown={editing ? startCandidate(c) : undefined}
                    onKeyDown={(e) =>
                      e.key === "Enter" && seekSource(c.src_start)
                    }
                    style={{
                      position: "absolute",
                      left: srcPct(c.src_start),
                      width: srcPct(c.src_end - c.src_start),
                      minWidth: 4,
                      top: 1,
                      bottom: 1,
                      border: `1px dashed ${token.colorPrimaryBorderHover}`,
                      background: token.colorPrimaryBg,
                      borderRadius: 2,
                      cursor: editing ? "grab" : "pointer",
                    }}
                  />
                </Tooltip>
              ))}
              {highlights.map((h, k) => (
                <div
                  key={`h${k}`}
                  aria-hidden
                  style={{
                    position: "absolute",
                    left: srcPct(h.start),
                    width: srcPct(h.end - h.start),
                    top: 0,
                    bottom: 0,
                    outline: `2px solid ${token.colorInfo}`,
                    borderRadius: 2,
                    pointerEvents: "none",
                  }}
                />
              ))}
              <div
                aria-hidden
                style={{
                  position: "absolute",
                  left: srcPct(srcNow),
                  top: -2,
                  bottom: -2,
                  width: 2,
                  background: token.colorError,
                  pointerEvents: "none",
                }}
              />
            </div>
          </div>
          {showLane && speaker ? (
            <SpeakerLane
              speaker={speaker}
              durationS={srcDur}
              at={srcNow}
              onSeek={seekSource}
              inset={`0 ${token.paddingSM}px 0 ${token.paddingXS}px`}
            />
          ) : null}
        </Flex>
      </Flex>

      {candDrag ? (
        <div
          aria-hidden
          style={{
            position: "fixed",
            left: candDrag.x + 8,
            top: candDrag.y + 8,
            padding: `2px ${token.paddingXS}px`,
            borderRadius: token.borderRadiusSM,
            background: token.colorBgElevated,
            border: `1px dashed ${token.colorPrimaryBorderHover}`,
            pointerEvents: "none",
            zIndex: 1000,
            fontSize: token.fontSizeSM,
          }}
        >
          Add {clock(candDrag.c.src_start)}–{clock(candDrag.c.src_end)}
        </div>
      ) : null}

      <CandidatesDrawer
        open={drawer}
        onClose={() => setDrawer(false)}
        candidates={candidates}
        transcript={transcript}
        full={full}
        onPreview={(c) => seekSource(c.src_start)}
        onAdd={(c) => {
          const at =
            selectedIndex >= 0 ? selectedIndex + 1 : edl.segments.length;
          edit(
            projectId,
            (d) => void addSegment(d as EDL, c.src_start, c.src_end, at),
          );
        }}
      />
    </Flex>
  );
}
