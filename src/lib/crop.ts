// Crop keyframes are in source time with linear interpolation (architecture.md section 7).
import type { CropKeyframe } from "@/api/types";

export function interpolateCrop(keyframes: CropKeyframe[] | undefined, t: number): { cx: number; cy: number; zoom: number } {
  if (!keyframes || keyframes.length === 0) return { cx: 0.5, cy: 0.5, zoom: 1 };
  if (t <= keyframes[0].t) return keyframes[0];
  const last = keyframes[keyframes.length - 1];
  if (t >= last.t) return last;
  let lo = 0;
  let hi = keyframes.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (keyframes[mid].t <= t) lo = mid;
    else hi = mid;
  }
  const a = keyframes[lo];
  const b = keyframes[hi];
  const f = b.t === a.t ? 0 : (t - a.t) / (b.t - a.t);
  return { cx: a.cx + (b.cx - a.cx) * f, cy: a.cy + (b.cy - a.cy) * f, zoom: a.zoom + (b.zoom - a.zoom) * f };
}

/** Position the video inside the output box so the crop window fills it. Values are CSS percentages. */
export function cropStyle(w0: number, h0: number, cx: number, cy: number) {
  const left = Math.min(Math.max(cx - w0 / 2, 0), 1 - w0);
  const top = Math.min(Math.max(cy - h0 / 2, 0), 1 - h0);
  return {
    width: `${100 / w0}%`,
    height: `${100 / h0}%`,
    left: `${(-left / w0) * 100}%`,
    top: `${(-top / h0) * 100}%`,
  };
}
