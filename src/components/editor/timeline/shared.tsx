"use client";
// Pieces shared by the plan timeline and the source timeline (design.md section 9 custom parts):
// track sizes, the toolbar time readout and zoom control, the track label column, the ruler, the playhead,
// the hover cursor, thumbnail sprite tiles and waveform drawing.
import {
  ColumnWidthOutlined,
  SoundOutlined,
  VideoCameraOutlined,
  ZoomInOutlined,
  ZoomOutOutlined,
} from "@ant-design/icons";
import { Button, Flex, Slider, theme, Tooltip } from "antd";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { Thumbnails } from "@/api/types";
import type { Waveform } from "@/hooks/useMedia";
import { clock } from "@/lib/format";

export const RULER_H = 24;
export const AUDIO_H = 44;
export const VIDEO_H = 52;
export const LABEL_W = 44;
// Zoom is relative to "fit": 1 = the whole timeline exactly fills the visible width, up to MAX_ZOOM times wider.
export const MAX_ZOOM = 20;
const ZOOM_STEP = 1.4;
const FIT_PAD = 16; // px kept free at the right end when fitted

function clampZoom(z: number): number {
  return Math.max(1, Math.min(MAX_ZOOM, z));
}

export interface FitZoom {
  /** Pixels per second actually drawn. */
  pps: number;
  /** 1 = fitted to the width. */
  zoom: number;
  /** Zoom to a level, keeping the time under screen x (px from the left of the view) where it is. */
  zoomTo: (zoom: number, anchor?: { t: number; x: number }) => void;
  /** Zoom by a factor around a time (kept in place; centred if it is off screen). */
  zoomAroundTime: (factor: number, t: number) => void;
  /** Back to the whole timeline in view. */
  fit: () => void;
  /** Content width in px: at least the view width. */
  contentWidth: number;
}

/** Fit-to-width zoom for a horizontally scrolling timeline. The fitted scale follows the view width (resizes)
 * and the duration (trims), so a 30 s or a 40 s plan always fills the width until the user zooms in. */
export function useFitZoom(
  scrollRef: React.RefObject<HTMLElement | null>,
  duration: number,
  viewW: number,
): FitZoom {
  const [zoom, setZoom] = useState(1);
  const fitPps = Math.max(0.01, (viewW - FIT_PAD) / Math.max(duration, 0.5));
  const pps = fitPps * zoom;
  const ppsRef = useRef(pps);
  const pending = useRef<{ t: number; x: number } | null>(null);
  useLayoutEffect(() => {
    ppsRef.current = pps; // read by the wheel handler and zoom helpers
  }, [pps]);

  // After a zoom, scroll so the anchored time stays under the same screen position.
  useLayoutEffect(() => {
    const el = scrollRef.current;
    const a = pending.current;
    if (!el || !a) return;
    pending.current = null;
    el.scrollLeft = Math.max(0, a.t * pps - a.x);
  }, [pps, scrollRef]);

  const zoomTo = useCallback((z: number, anchor?: { t: number; x: number }) => {
    pending.current = anchor ?? null;
    setZoom(clampZoom(z));
  }, []);

  const zoomAroundTime = useCallback(
    (factor: number, t: number) => {
      const el = scrollRef.current;
      const w = el?.clientWidth ?? viewW;
      let x = t * ppsRef.current - (el?.scrollLeft ?? 0);
      if (x < 0 || x > w) x = w / 2;
      setZoom((z) => {
        pending.current = { t, x };
        return clampZoom(z * factor);
      });
    },
    [scrollRef, viewW],
  );

  // Ctrl/Cmd + scroll zooms around the pointer.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      e.preventDefault();
      const x = e.clientX - el.getBoundingClientRect().left;
      const t = (el.scrollLeft + x) / ppsRef.current;
      const factor = e.deltaY < 0 ? 1.15 : 1 / 1.15;
      setZoom((z) => {
        pending.current = { t, x };
        return clampZoom(z * factor);
      });
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [scrollRef]);

  const fit = useCallback(() => zoomTo(1, { t: 0, x: 0 }), [zoomTo]);
  return { pps, zoom, zoomTo, zoomAroundTime, fit, contentWidth: Math.max(viewW, duration * pps + FIT_PAD) };
}

/** Thin horizontal scrollbar for a timeline's scroll container (Firefox and WebKit), coloured from tokens. */
export const THIN_SCROLL_CLASS = "clipora-timeline-scroll";
export function ThinScrollbarStyle() {
  const { token } = theme.useToken();
  const css = `.${THIN_SCROLL_CLASS}{scrollbar-width:thin;scrollbar-color:${token.colorFill} transparent}
.${THIN_SCROLL_CLASS}::-webkit-scrollbar{height:6px;width:6px}
.${THIN_SCROLL_CLASS}::-webkit-scrollbar-track{background:transparent}
.${THIN_SCROLL_CLASS}::-webkit-scrollbar-thumb{background:${token.colorFillSecondary};border-radius:${token.borderRadiusXS || 3}px}
.${THIN_SCROLL_CLASS}::-webkit-scrollbar-thumb:hover{background:${token.colorFill}}`;
  return <style>{css}</style>;
}

/** Ruler step that keeps labels at least 64 px apart. */
export function rulerStep(pps: number): number {
  for (const s of [0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300, 600]) if (s * pps >= 64) return s;
  return 1200;
}

/** m:ss.cc for the toolbar readout. */
export function clockCs(t: number): string {
  const v = Math.max(0, t);
  const m = Math.floor(v / 60);
  const s = Math.floor(v - m * 60);
  const cs = Math.floor((v - Math.floor(v)) * 100);
  return `${m}:${String(s).padStart(2, "0")}.${String(cs).padStart(2, "0")}`;
}

/** Background style that shows one sprite tile at its natural size. */
export function tileStyle(t: Thumbnails, time: number): React.CSSProperties | null {
  let sheet = t.sheets[0];
  for (const s of t.sheets) if (s.start_s <= time) sheet = s;
  if (!sheet) return null;
  const idx = Math.max(0, Math.min(sheet.count - 1, Math.floor((time - sheet.start_s) / t.interval_s)));
  const col = idx % t.columns;
  const row = Math.floor(idx / t.columns);
  return {
    backgroundImage: `url(${sheet.url})`,
    backgroundPosition: `-${col * t.tile_width}px -${row * t.tile_height}px`,
    backgroundSize: `${t.columns * t.tile_width}px ${t.rows * t.tile_height}px`,
    width: t.tile_width,
    height: t.tile_height,
  };
}

/** One sprite tile scaled to the track height, clipped to `width`. */
export function Tile({ t, time, left, width, height }: { t: Thumbnails; time: number; left: number; width: number; height: number }) {
  const ts = tileStyle(t, time);
  if (!ts) return null;
  return (
    <div style={{ position: "absolute", left, top: 0, width, height, overflow: "hidden" }}>
      <div
        style={{
          ...ts,
          backgroundRepeat: "no-repeat",
          transform: `scale(${height / t.tile_height})`,
          transformOrigin: "top left",
        }}
      />
    </div>
  );
}

/** Width of one tile scaled to the track height. */
export function tileWidth(t: Thumbnails, height: number): number {
  return (t.tile_width / t.tile_height) * height;
}

/**
 * Draw min/max bars for screen columns [x0, x1) into a canvas whose x = 0 is the left of the visible window.
 * `srcAt(x)` maps a column to source seconds; columns outside the waveform are skipped.
 */
export function drawWave(
  ctx: CanvasRenderingContext2D,
  wf: Waveform,
  x0: number,
  x1: number,
  srcAt: (x: number) => number,
  top: number,
  height: number,
): void {
  const mid = top + height / 2;
  const half = height / 2 - 2;
  for (let x = Math.floor(x0); x < x1; x++) {
    const i = Math.floor(srcAt(x) * wf.perSecond);
    if (i < 0 || i >= wf.max.length) continue;
    const hi = (wf.max[i] / 128) * half;
    const lo = (wf.min[i] / 128) * half;
    ctx.fillRect(x, mid - hi, 1, Math.max(1, hi - lo));
  }
}

/** Size a canvas to the visible window at device pixel ratio and return a cleared 2D context. */
export function prepareCanvas(c: HTMLCanvasElement, w: number, h: number): CanvasRenderingContext2D | null {
  const dpr = window.devicePixelRatio || 1;
  c.width = Math.max(1, Math.round(w * dpr));
  c.height = Math.max(1, Math.round(h * dpr));
  const ctx = c.getContext("2d");
  if (!ctx) return null;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);
  return ctx;
}

/** Track the width of a scroll container. */
export function useViewWidth(ref: React.RefObject<HTMLElement | null>): number {
  const [w, setW] = useState(800);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setW(el.clientWidth));
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);
  return w;
}

export function TimeReadout({ t }: { t: number }) {
  const { token } = theme.useToken();
  return (
    <div
      aria-live="off"
      aria-label={`Playhead at ${clock(t, true)}`}
      style={{
        minWidth: 84,
        textAlign: "center",
        padding: `2px ${token.paddingXS}px`,
        border: `1px solid ${token.colorBorder}`,
        borderRadius: token.borderRadiusSM,
        fontVariantNumeric: "tabular-nums",
        fontSize: token.fontSize,
        color: token.colorText,
        background: token.colorBgContainer,
      }}
    >
      {clockCs(t)}
    </div>
  );
}

/** Zoom out button, log-scale slider, zoom in button. */
export function ZoomControl({ zoom, onZoomTo, onStep, onFit }: {
  zoom: number;
  onZoomTo: (zoom: number) => void;
  onStep: (factor: number) => void;
  onFit: () => void;
}) {
  return (
    <Flex align="center" gap={4} style={{ width: 240 }}>
      <Tooltip title="Fit to width">
        <Button
          size="small"
          type="text"
          icon={<ColumnWidthOutlined />}
          disabled={zoom <= 1.001}
          onClick={onFit}
          aria-label="Fit to width"
        />
      </Tooltip>
      <Tooltip title="Zoom out">
        <Button
          size="small"
          type="text"
          icon={<ZoomOutOutlined />}
          disabled={zoom <= 1.001}
          onClick={() => onStep(1 / ZOOM_STEP)}
          aria-label="Zoom out"
        />
      </Tooltip>
      <Slider
        style={{ flex: 1, margin: "0 4px" }}
        min={0}
        max={Math.log(MAX_ZOOM)}
        step={0.01}
        value={Math.log(zoom)}
        tooltip={{ formatter: () => (zoom <= 1.001 ? "Fit" : `${zoom.toFixed(1)}×`) }}
        onChange={(v) => onZoomTo(Math.exp(v))}
        aria-label="Timeline zoom (Ctrl or Cmd + scroll)"
      />
      <Tooltip title="Zoom in">
        <Button
          size="small"
          type="text"
          icon={<ZoomInOutlined />}
          disabled={zoom >= MAX_ZOOM - 0.001}
          onClick={() => onStep(ZOOM_STEP)}
          aria-label="Zoom in"
        />
      </Tooltip>
    </Flex>
  );
}

/** Fixed left column: blank over the ruler, then one icon per track. */
export function TrackLabels({ extra }: { extra?: React.ReactNode }) {
  const { token } = theme.useToken();
  const cell = (h: number, icon: React.ReactNode, title: string, last = false) => (
    <Tooltip title={title} placement="right">
      <Flex
        align="center"
        justify="center"
        style={{
          height: h,
          color: token.colorTextSecondary,
          fontSize: token.fontSizeLG,
          borderBottom: last ? undefined : `1px solid ${token.colorBorderSecondary}`,
        }}
      >
        {icon}
      </Flex>
    </Tooltip>
  );
  return (
    <div style={{ width: LABEL_W, flexShrink: 0, borderRight: `1px solid ${token.colorBorderSecondary}` }}>
      <div style={{ height: RULER_H, borderBottom: `1px solid ${token.colorBorderSecondary}` }} />
      {cell(AUDIO_H, <SoundOutlined />, "Audio")}
      {cell(VIDEO_H, <VideoCameraOutlined />, "Video", !extra)}
      {extra}
    </div>
  );
}

/** Ruler ticks for the visible window, m:ss labels. */
export function Ruler({ pps, scrollLeft, viewW, max }: { pps: number; scrollLeft: number; viewW: number; max: number }) {
  const { token } = theme.useToken();
  const step = rulerStep(pps);
  const ticks: number[] = [];
  const first = Math.max(0, Math.floor(scrollLeft / pps / step) * step);
  for (let t = first; t * pps <= scrollLeft + viewW + 1 && t <= max + step; t += step) ticks.push(t);
  return (
    <>
      {ticks.map((t) => (
        <div
          key={t}
          aria-hidden
          style={{
            position: "absolute",
            left: t * pps,
            top: 0,
            height: RULER_H,
            borderLeft: `1px solid ${token.colorBorder}`,
            paddingLeft: 4,
            fontSize: token.fontSizeSM - 1,
            lineHeight: `${RULER_H}px`,
            color: token.colorTextTertiary,
            userSelect: "none",
            pointerEvents: "none",
            fontVariantNumeric: "tabular-nums",
          }}
        >
          {clock(t)}
        </div>
      ))}
    </>
  );
}

/** Real playhead: a line across ruler and tracks with a dot handle at the top. */
export function Playhead({ x, height }: { x: number; height: number }) {
  const { token } = theme.useToken();
  return (
    <div aria-hidden style={{ position: "absolute", left: x, top: 0, height, width: 0, pointerEvents: "none", zIndex: 8 }}>
      <div style={{ position: "absolute", left: -1, top: 4, bottom: 0, width: 2, background: token.colorError }} />
      <div
        style={{
          position: "absolute",
          left: -5,
          top: 0,
          width: 10,
          height: 10,
          borderRadius: "50%",
          background: token.colorError,
          boxShadow: `0 0 0 2px ${token.colorBgContainer}`,
        }}
      />
    </div>
  );
}

/**
 * Pseudo cursor: a thin line at the pointer with a time chip on the ruler. It listens on `target` itself and
 * keeps its own state, so moving the mouse never re-renders the timeline.
 */
export function HoverCursor({
  target,
  pps,
  max,
  height,
}: {
  target: React.RefObject<HTMLElement | null>;
  pps: number;
  max: number;
  height: number;
}) {
  const { token } = theme.useToken();
  const [t, setT] = useState<number | null>(null);
  useEffect(() => {
    const el = target.current;
    if (!el) return;
    const move = (e: PointerEvent) => {
      const rect = el.getBoundingClientRect();
      const v = (e.clientX - rect.left) / pps;
      setT(v >= 0 && v <= max ? v : null);
    };
    const leave = () => setT(null);
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerleave", leave);
    return () => {
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerleave", leave);
    };
  }, [target, pps, max]);
  if (t === null) return null;
  const x = t * pps;
  return (
    <div aria-hidden style={{ position: "absolute", left: x, top: 0, height, width: 0, pointerEvents: "none", zIndex: 9 }}>
      <div style={{ position: "absolute", left: 0, top: RULER_H - 2, bottom: 0, width: 1, background: token.colorTextSecondary }} />
      <div
        style={{
          position: "absolute",
          top: 2,
          left: 0,
          transform: "translateX(-50%)",
          padding: `0 ${token.paddingXXS + 2}px`,
          borderRadius: token.borderRadiusXS,
          background: token.colorBgSpotlight,
          color: token.colorTextLightSolid,
          fontSize: token.fontSizeSM - 1,
          lineHeight: `${RULER_H - 6}px`,
          whiteSpace: "nowrap",
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {clock(t, true)}
      </div>
    </div>
  );
}

/** Subtle horizontal separators under the ruler and between tracks, across the full content width. */
export function TrackLines({ width }: { width: number }) {
  const { token } = theme.useToken();
  const line = (top: number) => (
    <div aria-hidden style={{ position: "absolute", left: 0, top, width, height: 1, background: token.colorBorderSecondary, pointerEvents: "none" }} />
  );
  return (
    <>
      {line(RULER_H)}
      {line(RULER_H + AUDIO_H)}
      {line(RULER_H + AUDIO_H + VIDEO_H)}
    </>
  );
}
