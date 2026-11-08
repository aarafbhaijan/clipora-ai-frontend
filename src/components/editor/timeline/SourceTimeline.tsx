"use client";
// Source timeline: the whole original video before there is a plan (design.md section 9 custom parts).
// Toolbar, ruler, then an audio track (waveform) above a video track (thumbnails), with a playhead and a
// hover cursor. Click or drag to seek; hovering an idea outlines its moments. When a plan exists, Timeline
// replaces this.
import { Flex, theme, Typography } from "antd";
import { useEffect, useMemo, useRef, useState } from "react";
import type { SpeakerOut, Thumbnails } from "@/api/types";
import type { Waveform } from "@/hooks/useMedia";
import { clock } from "@/lib/format";
import { usePlayer } from "@/lib/playerStore";
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
  THIN_SCROLL_CLASS,
  ThinScrollbarStyle,
  useFitZoom,
  useViewWidth,
  VIDEO_H,
  ZoomControl,
} from "./shared";
import SpeakerLane, { SpeakerLaneLabel } from "./SpeakerLane";

const TRACKS_H = RULER_H + AUDIO_H + VIDEO_H + 1;
const THUMB_H = VIDEO_H - 4; // thumbnails sit inside the video track with a 2 px margin

interface Props {
  durationS: number;
  waveform: Waveform | undefined;
  thumbnails: Thumbnails | null | undefined;
  /** Who talks when; the Speakers lane shows while the speaker boxes are on. */
  speaker?: SpeakerOut;
}

export default function SourceTimeline({ durationS, waveform, thumbnails, speaker }: Props) {
  const { token } = theme.useToken();
  const scrollRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const waveRef = useRef<HTMLCanvasElement>(null);
  const viewW = useViewWidth(scrollRef);
  const [scrollLeft, setScrollLeft] = useState(0);
  const sourceTime = usePlayer((s) => s.sourceTime);
  const playing = usePlayer((s) => s.playing);
  const highlights = usePlayer((s) => s.highlights);
  const seekSource = usePlayer((s) => s.seekSource);

  const dur = Math.max(durationS, 0.1);
  // Fitted to the width by default; zoom buttons and the slider keep the playhead in place.
  const zoom = useFitZoom(scrollRef, dur, viewW);
  const scale = zoom.pps;
  const width = zoom.contentWidth;

  // Keep the playhead in view while playing.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || !playing) return;
    const x = sourceTime * scale;
    if (x < el.scrollLeft || x > el.scrollLeft + el.clientWidth - 40) el.scrollLeft = Math.max(0, x - 80);
  }, [sourceTime, scale, playing]);

  // Audio track: only the visible window is drawn.
  useEffect(() => {
    const c = waveRef.current;
    if (!c) return;
    const ctx = prepareCanvas(c, viewW, AUDIO_H);
    if (!ctx || !waveform) return;
    ctx.fillStyle = token.colorTextSecondary;
    drawWave(ctx, waveform, 0, Math.min(viewW, dur * scale - scrollLeft), (x) => (x + scrollLeft) / scale, 0, AUDIO_H);
  }, [waveform, scale, scrollLeft, viewW, dur, token.colorTextSecondary]);

  // Video track: only tiles in (or near) the visible window are rendered.
  const tiles = useMemo(() => {
    if (!thumbnails) return [];
    const tw = tileWidth(thumbnails, THUMB_H);
    const total = dur * scale;
    const first = Math.max(0, Math.floor((scrollLeft - tw) / tw));
    const last = Math.min(Math.ceil(total / tw), Math.ceil((scrollLeft + viewW + tw) / tw));
    const out: { x: number; w: number; t: number }[] = [];
    for (let k = first; k < last; k++) {
      const x = k * tw;
      out.push({ x, w: Math.min(tw, total - x), t: Math.min(dur, (x + tw / 2) / scale) });
    }
    return out;
  }, [thumbnails, dur, scale, scrollLeft, viewW]);

  // Keep this time under its current screen position when zooming (centre it if it is off screen).
  const anchorAt = (t: number) => {
    const el = scrollRef.current;
    const x = t * scale - (el?.scrollLeft ?? 0);
    return { t, x: x < 0 || x > viewW ? viewW / 2 : x };
  };

  const seekAt = (clientX: number) => {
    const el = contentRef.current;
    if (!el) return;
    seekSource(Math.max(0, Math.min(dur, (clientX - el.getBoundingClientRect().left) / scale)));
  };

  return (
    <Flex vertical style={{ height: "100%", minHeight: 0 }}>
      <Flex
        align="center"
        gap={token.paddingSM}
        style={{ padding: `${token.paddingXXS}px ${token.paddingSM}px`, borderBottom: `1px solid ${token.colorBorderSecondary}` }}
      >
        <TimeReadout t={sourceTime} />
        <Typography.Text type="secondary" ellipsis style={{ flex: 1, fontSize: token.fontSizeSM }}>
          Original video · {clock(dur)}. Ask in the chat, pick an idea, or convert the whole video above the player.
        </Typography.Text>
        <ZoomControl
          zoom={zoom.zoom}
          onZoomTo={(z) => zoom.zoomTo(z, anchorAt(sourceTime))}
          onStep={(f) => zoom.zoomAroundTime(f, sourceTime)}
          onFit={zoom.fit}
        />
      </Flex>
      <ThinScrollbarStyle />
      <Flex style={{ flex: 1, minHeight: 0 }}>
        <TrackLabels extra={speaker?.turns?.length ? <SpeakerLaneLabel /> : undefined} />
        <Flex vertical style={{ flex: 1, minWidth: 0 }}>
        <div
          ref={scrollRef}
          className={THIN_SCROLL_CLASS}
          onScroll={(e) => setScrollLeft(e.currentTarget.scrollLeft)}
          style={{ minWidth: 0, overflowX: "auto", overflowY: "hidden", position: "relative", flexShrink: 0 }}
        >
          <div
            ref={contentRef}
            role="slider"
            tabIndex={0}
            aria-label="Original video timeline"
            aria-valuemin={0}
            aria-valuemax={Math.round(dur)}
            aria-valuenow={Math.round(sourceTime)}
            aria-valuetext={clock(sourceTime)}
            onKeyDown={(e) => {
              if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
                e.preventDefault();
                const d = (e.shiftKey ? 5 : 1) * (e.key === "ArrowRight" ? 1 : -1);
                seekSource(Math.max(0, Math.min(dur, sourceTime + d)));
              }
            }}
            onPointerDown={(e) => {
              if (e.button !== 0) return;
              e.currentTarget.setPointerCapture(e.pointerId);
              seekAt(e.clientX);
            }}
            onPointerMove={(e) => {
              if (e.buttons & 1) seekAt(e.clientX);
            }}
            style={{ position: "relative", width, height: TRACKS_H, cursor: "pointer", outline: "none" }}
          >
            <TrackLines width={width} />
            <Ruler pps={scale} scrollLeft={scrollLeft} viewW={viewW} max={dur} />
            <canvas
              ref={waveRef}
              aria-hidden
              style={{ position: "absolute", left: scrollLeft, top: RULER_H, width: viewW, height: AUDIO_H, pointerEvents: "none" }}
            />
            <div
              aria-hidden
              style={{
                position: "absolute",
                left: 0,
                top: RULER_H + AUDIO_H + 2,
                width: dur * scale,
                height: THUMB_H,
                overflow: "hidden",
                borderRadius: token.borderRadiusSM,
                background: token.colorFillTertiary,
                pointerEvents: "none",
              }}
            >
              {thumbnails
                ? tiles.map((tile) => (
                    <Tile key={tile.x} t={thumbnails} time={tile.t} left={tile.x} width={tile.w} height={THUMB_H} />
                  ))
                : null}
            </div>
            {highlights.map((h) => (
              <div
                key={`${h.start}-${h.end}`}
                aria-hidden
                style={{
                  position: "absolute",
                  left: h.start * scale,
                  width: Math.max(2, (h.end - h.start) * scale),
                  top: RULER_H,
                  height: AUDIO_H + VIDEO_H,
                  background: token.colorPrimaryBg,
                  border: `1px dashed ${token.colorPrimary}`,
                  borderRadius: token.borderRadiusSM,
                  pointerEvents: "none",
                }}
              />
            ))}
            <Playhead x={sourceTime * scale} height={TRACKS_H} />
            <HoverCursor target={contentRef} pps={scale} max={dur} height={TRACKS_H} />
          </div>
        </div>
        {speaker?.turns?.length ? (
          <SpeakerLane speaker={speaker} durationS={dur} at={sourceTime} onSeek={seekSource} />
        ) : null}
        </Flex>
      </Flex>
    </Flex>
  );
}
