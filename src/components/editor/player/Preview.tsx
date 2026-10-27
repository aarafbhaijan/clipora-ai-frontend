"use client";
// Preview (design.md section 6, architecture.md section 14): two <video> layers on the proxy inside a box
// with the output aspect ratio. Layer i % 2 plays segment i. The next layer pre-seeks before each boundary
// (lead = transition duration + 0.5 s, 0.5 s for a cut). Output time comes from the active layer's frame
// callback: tOut = tOutStart(i) + (currentTime - src_start(i)). Each layer applies its own segment's crop.
import { CaretRightFilled, PauseOutlined, RollbackOutlined } from "@ant-design/icons";
import { Alert, Button, Flex, Slider, Tag, theme, Tooltip, Typography } from "antd";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { EDL, SpeakerOut } from "@/api/types";
import { cropWindow } from "@/lib/aspect";
import { cropStyle, interpolateCrop } from "@/lib/crop";
import { clock } from "@/lib/format";
import { usePlayer } from "@/lib/playerStore";
import { boundaries, effectiveDuration, outputDuration, segmentTimings, type SegmentTiming } from "@/lib/timemap";
import { cueAt, type Transcript } from "@/lib/transcript";
import { SPEC, transitionStyles, type LayerStyle } from "@/lib/transitions";
import { mediaColors } from "@/theme";
import { useVideoSrc } from "./Quality";
import SpeakerOverlay, { type SpeakerView } from "./SpeakerOverlay";
import VolumeControl, { useApplyVolume } from "./VolumeControl";

interface Props {
  speaker?: SpeakerOut;
  proxyUrl: string | null | undefined;
  sourceUrl?: string | null;
  edl: EDL;
  transcript: Transcript | undefined;
  srcWidth: number;
  srcHeight: number;
}

interface Engine {
  active: number; // segment index on screen
  prepared: number; // segment index pre-seeked on the other layer, -1 if none
  playing: boolean;
  tOut: number;
  lastPublish: number;
}

const PUBLISH_MS = 66; // ~15 updates per second to the rest of the editor

export default function Preview({ proxyUrl, sourceUrl, edl, transcript, srcWidth, srcHeight, speaker }: Props) {
  const { token } = theme.useToken();
  const wrapRef = useRef<HTMLDivElement>(null);
  // One element per layer, filled by callback refs and only touched outside render.
  const videoEls = useRef<(HTMLVideoElement | null)[]>([null, null]);
  const canvasEls = useRef<(HTMLCanvasElement | null)[]>([null, null]);
  const boxEls = useRef<(HTMLDivElement | null)[]>([null, null]);
  const dipRef = useRef<HTMLDivElement>(null);
  const engine = useRef<Engine>({ active: 0, prepared: -1, playing: false, tOut: 0, lastPublish: 0 });
  const [box, setBox] = useState({ w: 0, h: 0 });
  const [caption, setCaption] = useState("");
  const [loadError, setLoadError] = useState(false);

  const player = usePlayer();
  const video = useVideoSrc(proxyUrl, sourceUrl);
  const timings = useMemo(() => segmentTimings(edl), [edl]);
  const trans = useMemo(() => boundaries(edl), [edl]);
  const total = useMemo(() => outputDuration(edl), [edl]);
  const outW = edl.output?.width ?? 1080;
  const outH = edl.output?.height ?? 1920;
  const fit = edl.output?.framing === "fit";
  const [w0, h0] = cropWindow(srcWidth, srcHeight, outW, outH);
  const approximate = trans.some((t) => SPEC[t.type]?.approximate);
  const edits = useMemo(() => edl.captions?.edits ?? {}, [edl.captions?.edits]);
  const captionsOn = edl.captions?.enabled !== false;

  // Keep the box at the output aspect ratio inside the available space.
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      const aw = el.clientWidth;
      const ah = el.clientHeight - 56; // controls row
      const r = outW / outH;
      const w = Math.max(0, Math.min(aw, ah * r));
      setBox({ w, h: w / r });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [outW, outH]);

  const layerOf = (i: number) => i % 2;

  const applyCrop = useCallback(
    (layer: number, seg: SegmentTiming | null) => {
      const v = videoEls.current[layer];
      if (!v) return;
      if (fit || !seg || player.sourceMode) {
        Object.assign(v.style, { width: "100%", height: "100%", left: "0", top: "0", objectFit: "contain" });
        return;
      }
      const k = interpolateCrop(edl.segments[seg.index]?.crop, v.currentTime);
      Object.assign(v.style, { ...cropStyle(w0, h0, k.cx, k.cy), objectFit: "fill" });
    },
    [edl, fit, w0, h0, player.sourceMode],
  );

  const drawFitBackground = useCallback(
    (layer: number) => {
      if (!fit && !player.sourceMode) return;
      const v = videoEls.current[layer];
      const c = canvasEls.current[layer];
      if (!v || !c || v.readyState < 2) return;
      const ctx = c.getContext("2d");
      if (!ctx) return;
      c.width = 160;
      c.height = Math.round(160 * (box.h / Math.max(1, box.w)));
      const scale = Math.max(c.width / v.videoWidth, c.height / v.videoHeight);
      const dw = v.videoWidth * scale;
      const dh = v.videoHeight * scale;
      ctx.filter = "blur(6px)";
      ctx.drawImage(v, (c.width - dw) / 2, (c.height - dh) / 2, dw, dh);
    },
    [fit, box.w, box.h, player.sourceMode],
  );

  const styleLayer = (layer: number, s: LayerStyle & { visible: boolean }) => {
    const el = boxEls.current[layer];
    if (!el) return;
    el.style.opacity = s.visible ? String(s.opacity ?? 1) : "0";
    el.style.transform = s.transform ?? "none";
    el.style.clipPath = s.clipPath ?? "none";
    el.style.zIndex = s.visible ? "1" : "0";
  };

  const setDip = (amount: number, white: boolean) => {
    const el = dipRef.current;
    if (!el) return;
    el.style.opacity = String(amount);
    el.style.background = white ? mediaColors.dipWhite : mediaColors.dipBlack;
  };

  const publish = useCallback(
    (force = false) => {
      const e = engine.current;
      const now = performance.now();
      if (!force && now - e.lastPublish < PUBLISH_MS) return;
      e.lastPublish = now;
      const v = videoEls.current[layerOf(e.active)];
      const src = v?.currentTime ?? 0;
      if (player.sourceMode) {
        usePlayer.getState().set({ sourceTime: src });
      } else {
        usePlayer.getState().set({ tOut: e.tOut, segIndex: e.active });
      }
      if (transcript && captionsOn) {
        const cue = cueAt(transcript.cues, src);
        const seg = timings[e.active];
        const inside = player.sourceMode || (cue && seg && cue.end > seg.srcStart && cue.start < seg.srcEnd);
        setCaption(cue && inside ? edits[cue.id] ?? cue.text : "");
      } else setCaption("");
    },
    [player.sourceMode, transcript, captionsOn, edits, timings],
  );

  /** Show the frame at e.active (and the incoming layer during an overlap) without playing. */
  const renderStatic = useCallback(() => {
    const e = engine.current;
    const a = layerOf(e.active);
    const seg = timings[e.active];
    applyCrop(a, seg ?? null);
    drawFitBackground(a);
    const next = timings[e.active + 1];
    const d = trans[e.active] ? effectiveDuration(trans[e.active]) : 0;
    if (next && e.prepared === e.active + 1 && e.tOut >= next.tOutStart) {
      const p = d > 0 ? (e.tOut - next.tOutStart) / d : 1;
      const st = transitionStyles(trans[e.active].type, p);
      styleLayer(a, { ...st.a, visible: true });
      styleLayer(layerOf(e.active + 1), { ...st.b, visible: true });
      applyCrop(layerOf(e.active + 1), next);
      setDip(st.dip, st.dipWhite);
    } else {
      styleLayer(a, { visible: true });
      styleLayer(1 - a, { visible: false });
      setDip(0, false);
    }
  }, [timings, trans, applyCrop, drawFitBackground]);

  const seekOut = useCallback(
    (tOut: number) => {
      const e = engine.current;
      const t = Math.max(0, Math.min(tOut, Math.max(0, total - 0.01)));
      const hits = timings.filter((s) => s.tOutStart <= t && t < s.tOutEnd);
      const first = hits[0] ?? timings[timings.length - 1];
      if (!first) return;
      e.active = first.index;
      e.tOut = t;
      e.prepared = -1;
      const va = videoEls.current[layerOf(first.index)];
      if (va) va.currentTime = first.srcStart + (t - first.tOutStart);
      const second = hits[1];
      const vb = videoEls.current[layerOf(first.index + 1)];
      const next = timings[first.index + 1];
      if (vb && next) {
        vb.currentTime = second ? second.srcStart + (t - second.tOutStart) : next.srcStart;
        e.prepared = first.index + 1;
      }
      if (!e.playing) {
        videoEls.current.forEach((v) => v?.pause());
      } else {
        va?.play().catch(() => undefined);
        if (second) vb?.play().catch(() => undefined);
      }
      renderStatic();
      publish(true);
    },
    [timings, total, renderStatic, publish],
  );

  // The frame loop while playing.
  const tick = useCallback(() => {
    const e = engine.current;
    if (!e.playing) return;
    if (player.sourceMode) {
      drawFitBackground(0);
      publish();
      return;
    }
    const i = e.active;
    const seg = timings[i];
    const a = layerOf(i);
    const va = videoEls.current[a];
    if (!seg || !va) return;
    e.tOut = seg.tOutStart + (va.currentTime - seg.srcStart);
    applyCrop(a, seg);
    drawFitBackground(a);

    const next = timings[i + 1];
    if (next) {
      const d = effectiveDuration(trans[i]);
      const lead = (d > 0 ? d : 0) + 0.5;
      const vb = videoEls.current[layerOf(i + 1)];
      if (vb && e.prepared !== i + 1 && e.tOut >= next.tOutStart - lead) {
        vb.currentTime = next.srcStart;
        vb.pause();
        e.prepared = i + 1;
      }
      if (vb && e.tOut >= next.tOutStart) {
        if (vb.paused) vb.play().catch(() => undefined);
        const p = d > 0 ? (e.tOut - next.tOutStart) / d : 1;
        const st = transitionStyles(trans[i].type, p);
        styleLayer(a, { ...st.a, visible: p < 1 });
        styleLayer(layerOf(i + 1), { ...st.b, visible: true });
        applyCrop(layerOf(i + 1), next);
        drawFitBackground(layerOf(i + 1));
        setDip(st.dip, st.dipWhite);
      }
      if (e.tOut >= seg.tOutEnd) {
        va.pause();
        e.active = i + 1;
        e.prepared = -1;
        styleLayer(layerOf(i + 1), { visible: true });
        styleLayer(a, { visible: false });
        setDip(0, false);
      }
    } else if (e.tOut >= seg.tOutEnd) {
      va.pause();
      e.playing = false;
      e.tOut = total;
      usePlayer.getState().set({ playing: false });
    }
    publish();
  }, [timings, trans, total, applyCrop, drawFitBackground, publish, player.sourceMode]);

  // Drive the loop from video frame callbacks where available, else animation frames.
  useEffect(() => {
    if (!player.playing) return;
    let stop = false;
    let raf = 0;
    const loop = () => {
      if (stop) return;
      tick();
      const v = videoEls.current[layerOf(engine.current.active)] as
        | (HTMLVideoElement & { requestVideoFrameCallback?: (cb: () => void) => number })
        | null;
      if (v?.requestVideoFrameCallback && !v.paused) v.requestVideoFrameCallback(loop);
      else raf = requestAnimationFrame(loop);
    };
    loop();
    return () => {
      stop = true;
      cancelAnimationFrame(raf);
    };
  }, [player.playing, tick]);

  const play = useCallback(() => {
    const e = engine.current;
    if (player.sourceMode) {
      e.playing = true;
      videoEls.current[0]?.play().catch(() => undefined);
      usePlayer.getState().set({ playing: true });
      return;
    }
    if (e.tOut >= total - 0.05) seekOut(0);
    e.playing = true;
    const va = videoEls.current[layerOf(e.active)];
    va?.play().catch(() => undefined);
    const next = timings[e.active + 1];
    if (next && e.tOut >= next.tOutStart) videoEls.current[layerOf(e.active + 1)]?.play().catch(() => undefined);
    usePlayer.getState().set({ playing: true });
  }, [player.sourceMode, total, timings, seekOut]);

  const pause = useCallback(() => {
    engine.current.playing = false;
    videoEls.current.forEach((v) => v?.pause());
    usePlayer.getState().set({ playing: false });
    publish(true);
  }, [publish]);

  // Switching between the editor copy and the original reloads both layers; stop so the engine and the videos
  // agree. onLoadedData then seeks back to the same moment.
  useEffect(() => {
    if (engine.current.playing) pause();
  }, [video.src, pause]);

  // Seek requests from the transcript, timeline and citations.
  useEffect(() => {
    const req = player.seek;
    if (!req.n) return;
    if (req.src !== undefined) {
      const v = videoEls.current[0];
      videoEls.current[1]?.pause(); // only one layer may play the source
      engine.current.active = 0;
      if (v) v.currentTime = req.src;
      styleLayer(0, { visible: true });
      styleLayer(1, { visible: false });
      setDip(0, false);
      applyCrop(0, null);
      publish(true);
    } else if (req.tOut !== undefined) {
      seekOut(req.tOut);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- runs only when the trigger changes
  }, [player.seek.n]);

  // Switching videos (or anything else that calls stop()) halts every layer, so nothing keeps playing behind.
  useEffect(() => {
    if (!player.stopRequest) return;
    pause();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- runs only when the trigger changes
  }, [player.stopRequest]);

  // Space bar and the play button go through the store so the timeline can toggle too.
  useEffect(() => {
    if (!player.toggleRequest) return;
    if (engine.current.playing) pause();
    else play();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- runs only when the trigger changes
  }, [player.toggleRequest]);

  // Re-render the still frame when the plan changes (trim, aspect, transition).
  useEffect(() => {
    if (!engine.current.playing && !player.sourceMode) seekOut(Math.min(engine.current.tOut, total));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- runs only when the trigger changes
  }, [edl]);

  // For the speaker overlay: the source time on screen and which part of the source frame the box shows.
  const speakerView = (): SpeakerView | null => {
    const e = engine.current;
    const layer = player.sourceMode ? 0 : layerOf(e.active);
    const v = videoEls.current[layer];
    if (!v) return null;
    const base = { srcTime: v.currentTime, videoW: v.videoWidth || srcWidth, videoH: v.videoHeight || srcHeight };
    if (fit || player.sourceMode) return { ...base, window: null };
    const seg = timings[e.active];
    if (!seg) return null;
    const k = interpolateCrop(edl.segments[seg.index]?.crop, v.currentTime);
    const left = Math.min(Math.max(k.cx - w0 / 2, 0), 1 - w0);
    const top = Math.min(Math.max(k.cy - h0 / 2, 0), 1 - h0);
    return { ...base, window: { left, top, w: w0, h: h0 } };
  };

  useApplyVolume(() => videoEls.current);

  const backToEdit = () => {
    pause();
    usePlayer.getState().set({ sourceMode: false });
    seekOut(engine.current.tOut);
  };

  if (!proxyUrl) {
    return (
      <Flex align="center" justify="center" style={{ height: "100%" }}>
        <Typography.Text type="secondary">The preview appears when the video is ready.</Typography.Text>
      </Flex>
    );
  }

  const shownTime = player.sourceMode ? player.sourceTime : player.tOut;
  const captionSize = Math.max(12, box.h * 0.045);

  return (
    <Flex vertical style={{ height: "100%", padding: 8 }} gap={8}>
      {player.sourceMode ? (
        <Alert
          type="info"
          showIcon
          title="Playing the source"
          description="This part is not in your edit."
          action={
            <Button size="small" icon={<RollbackOutlined />} onClick={backToEdit}>
              Back to edit
            </Button>
          }
        />
      ) : null}
      <div ref={wrapRef} style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", alignItems: "center" }}>
        <div
          style={{
            position: "relative",
            width: box.w,
            height: box.h,
            overflow: "hidden",
            background: mediaColors.letterbox,
            borderRadius: token.borderRadius,
            cursor: "pointer",
          }}
          onClick={() => (engine.current.playing ? pause() : play())}
          title={player.playing ? "Click to pause" : "Click to play"}
          aria-label={`Preview, ${edl.output?.aspect ?? ""}`}
        >
          {[0, 1].map((layer) => (
            <div key={layer} ref={(el) => {
                boxEls.current[layer] = el;
              }} style={{ position: "absolute", inset: 0, opacity: layer === 0 ? 1 : 0 }}>
              <canvas
                ref={(el) => {
                  canvasEls.current[layer] = el;
                }}
                style={{ position: "absolute", inset: 0, width: "100%", height: "100%", display: fit || player.sourceMode ? "block" : "none" }}
              />
              <video
                ref={(el) => {
                  videoEls.current[layer] = el;
                }}
                src={video.src ?? undefined}
                playsInline
                preload="auto"
                crossOrigin="anonymous"
                onLoadedData={() => layer === 0 && seekOut(engine.current.tOut)}
                onSeeked={() => drawFitBackground(layer)}
                onError={() => video.fellBack() || setLoadError(true)}
                style={{ position: "absolute", left: 0, top: 0, width: "100%", height: "100%" }}
              />
            </div>
          ))}
          <div ref={dipRef} style={{ position: "absolute", inset: 0, opacity: 0, pointerEvents: "none", zIndex: 2 }} />
          {player.showSpeaker ? <SpeakerOverlay speaker={speaker} view={speakerView} /> : null}
          {caption ? (
            <div
              style={{
                position: "absolute",
                left: "6%",
                right: "6%",
                bottom: "14%",
                zIndex: 3,
                textAlign: "center",
                color: mediaColors.caption,
                fontWeight: 700,
                fontSize: captionSize,
                lineHeight: 1.25,
                textShadow: `0 2px 6px ${mediaColors.captionShadow}`,
                pointerEvents: "none",
              }}
            >
              {caption}
            </div>
          ) : null}
        </div>
        <Flex align="center" gap={8} style={{ width: "100%", maxWidth: Math.max(box.w, 320), marginTop: 8 }}>
          <Button
            type="primary"
            shape="circle"
            aria-label={player.playing ? "Pause" : "Play"}
            icon={player.playing ? <PauseOutlined /> : <CaretRightFilled />}
            onClick={() => (player.playing ? pause() : play())}
          />
          <Slider
            style={{ flex: 1 }}
            min={0}
            max={player.sourceMode ? edl.source.duration_s : Math.max(total, 0.01)}
            step={0.05}
            value={shownTime}
            tooltip={{ formatter: (v) => clock(v ?? 0, true) }}
            onChange={(v) => (player.sourceMode ? usePlayer.getState().seekSource(v) : seekOut(v))}
            aria-label="Seek"
          />
          <Typography.Text type="secondary" style={{ fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>
            {clock(shownTime)} / {clock(player.sourceMode ? edl.source.duration_s : total)}
          </Typography.Text>
          <VolumeControl />
          {approximate ? (
            <Tooltip title="Some transitions look slightly different in the export.">
              <Tag>Approximate preview</Tag>
            </Tooltip>
          ) : null}
        </Flex>
        {loadError ? <Alert type="warning" showIcon title="The preview video couldn't load." style={{ marginTop: 8 }} /> : null}
      </div>
    </Flex>
  );
}
