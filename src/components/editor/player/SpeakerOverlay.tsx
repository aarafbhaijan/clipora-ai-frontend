"use client";
// Speaker overlay: the YOLO person boxes drawn over the video, green for the person the crop and the export follow
// at that moment (whoever is talking, from lip movement; before anyone talks, the main person), red for everyone
// else. It is display only: export never draws it. The player passes `view()`, which says, for the frame on
// screen, the source time and which part of the source frame is visible.
import { AimOutlined } from "@ant-design/icons";
import { Button, theme, Tooltip } from "antd";
import { useEffect, useRef } from "react";
import type { SpeakerOut } from "@/api/types";
import { usePlayer } from "@/lib/playerStore";
import { focusTrack, personLabels, talkingAt } from "@/lib/speakers";

/** What is on screen: source time, and the visible part of the source frame (fractions) or the whole frame. */
export interface SpeakerView {
  srcTime: number;
  /** Visible window of the source (crop). Null: the whole frame is shown, letterboxed to fit (contain). */
  window: { left: number; top: number; w: number; h: number } | null;
  videoW: number; // source pixel size, for the contain fit
  videoH: number;
}

const MAX_GAP_S = 0.5; // detections are ~3 per second; farther than this, draw nothing rather than a stale box

function nearestFrame(frames: SpeakerOut["frames"], t: number) {
  let lo = 0;
  let hi = frames.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (frames[mid].t < t) lo = mid + 1;
    else hi = mid;
  }
  const a = frames[lo];
  const b = frames[Math.max(0, lo - 1)];
  const best = !a ? b : !b ? a : Math.abs(a.t - t) <= Math.abs(b.t - t) ? a : b;
  return best && Math.abs(best.t - t) <= MAX_GAP_S ? best : null;
}

export default function SpeakerOverlay({ speaker, view }: { speaker: SpeakerOut | undefined; view: () => SpeakerView | null }) {
  const { token } = theme.useToken();
  const ref = useRef<HTMLCanvasElement>(null);
  const viewRef = useRef(view);
  useEffect(() => {
    viewRef.current = view;
  });

  useEffect(() => {
    const c = ref.current;
    if (!c || !speaker?.available || !speaker.frames.length) return;
    const labels = personLabels(speaker);
    let raf = 0;
    const draw = () => {
      raf = requestAnimationFrame(draw);
      const W = c.clientWidth;
      const H = c.clientHeight;
      const dpr = window.devicePixelRatio || 1;
      if (c.width !== Math.round(W * dpr) || c.height !== Math.round(H * dpr)) {
        c.width = Math.round(W * dpr);
        c.height = Math.round(H * dpr);
      }
      const ctx = c.getContext("2d");
      if (!ctx) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, W, H);
      const v = viewRef.current();
      if (!v) return;
      const frame = nearestFrame(speaker.frames, v.srcTime);
      if (!frame) return;
      const focus = focusTrack(speaker, v.srcTime);
      const talking = talkingAt(speaker, v.srcTime);
      // Source fraction (x, y) -> overlay pixels.
      let map: (x: number, y: number) => [number, number];
      if (v.window) {
        const win = v.window;
        map = (x, y) => [((x - win.left) / win.w) * W, ((y - win.top) / win.h) * H];
      } else {
        const a = v.videoW / Math.max(1, v.videoH);
        const fitW = W / H > a ? H * a : W;
        const fitH = W / H > a ? H : W / a;
        const ox = (W - fitW) / 2;
        const oy = (H - fitH) / 2;
        map = (x, y) => [ox + x * fitW, oy + y * fitH];
      }
      for (const b of frame.boxes) {
        const main = b.track_id === focus;
        const [x1, y1] = map(b.x1, b.y1);
        const [x2, y2] = map(b.x2, b.y2);
        ctx.lineWidth = main ? 3 : 2;
        ctx.strokeStyle = main ? token.colorSuccess : token.colorError;
        ctx.strokeRect(x1, y1, x2 - x1, y2 - y1);
        const name = labels.get(b.track_id);
        const label =
          talking?.track_id === b.track_id
            ? `${name ?? "Person"} · talking`
            : (name ?? (main ? "Speaker" : "Person"));
        ctx.font = `600 ${token.fontSizeSM}px ${token.fontFamily}`;
        const tw = ctx.measureText(label).width + 10;
        ctx.fillStyle = main ? token.colorSuccess : token.colorError;
        ctx.fillRect(x1, Math.max(0, y1 - 18), tw, 18);
        ctx.fillStyle = token.colorWhite;
        ctx.fillText(label, x1 + 5, Math.max(13, y1 - 5));
      }
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [speaker, token]);

  return (
    <canvas
      ref={ref}
      aria-hidden
      style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none", zIndex: 4 }}
    />
  );
}

/** Button above the video that shows or hides the speaker boxes. */
export function SpeakerToggle() {
  const on = usePlayer((s) => s.showSpeaker);
  const set = usePlayer((s) => s.set);
  return (
    <Tooltip title={on ? "Hide the speaker boxes" : "Show who is talking (green box, Speakers lane on the timeline) and other people (red). Not exported."}>
      <Button
        size="small"
        type={on ? "primary" : "default"}
        icon={<AimOutlined />}
        aria-pressed={on}
        onClick={() => set({ showSpeaker: !on })}
      >
        Speaker
      </Button>
    </Tooltip>
  );
}
