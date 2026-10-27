// Port of backend/packages/core/src/core/aspect.py: output size from an aspect label, and the crop window.
export const PRESETS = ["9:16", "1:1", "4:5", "16:9", "21:9"] as const;
export const SHORT_SIDE = 1080;
export const MIN_SIDE = 240;
export const MAX_SIDE = 4096;

const even = (n: number) => Math.max(2, Math.round(n / 2) * 2);

export function parseAspect(aspect: string): [number, number] | null {
  const m = /^(\d+):(\d+)$/.exec(aspect);
  if (!m || Number(m[1]) === 0 || Number(m[2]) === 0) return null;
  return [Number(m[1]), Number(m[2])];
}

export function outputSize(aspect: string, shortSide = SHORT_SIDE): [number, number] {
  const p = parseAspect(aspect) ?? [9, 16];
  const [w, h] = p;
  let width: number;
  let height: number;
  if (w >= h) {
    width = even((shortSide * w) / h);
    height = shortSide;
  } else {
    width = shortSide;
    height = even((shortSide * h) / w);
  }
  if (Math.max(width, height) > MAX_SIDE) {
    const scale = MAX_SIDE / Math.max(width, height);
    width = even(width * scale);
    height = even(height * scale);
  }
  return [width, height];
}

function gcd(a: number, b: number): number {
  return b === 0 ? a : gcd(b, a % b);
}

export function aspectLabel(width: number, height: number): string {
  const g = gcd(width, height);
  return `${width / g}:${height / g}`;
}

/** Crop window size as fractions of the source frame: w0 = min(1, T/S), h0 = min(1, S/T), divided by zoom. */
export function cropWindow(srcW: number, srcH: number, outW: number, outH: number, zoom = 1): [number, number] {
  const s = srcW / srcH;
  const t = outW / outH;
  return [Math.min(1, t / s) / zoom, Math.min(1, s / t) / zoom];
}

/** How much the export enlarges the source (output pixels per source pixel; above 1 the picture gets softer), and
 * the largest size of the same shape that keeps it at 1:1. Crop scales the crop window; Fit scales the whole frame. */
export function enlargement(
  srcW: number,
  srcH: number,
  out: { aspect: string; width: number; height: number; framing: string },
): { factor: number; native: [number, number] } {
  let factor: number;
  if (out.framing === "fit") {
    factor = Math.min(out.width / srcW, out.height / srcH);
  } else {
    const [w0] = cropWindow(srcW, srcH, out.width, out.height);
    factor = out.width / (w0 * srcW);
  }
  const fits = Math.min(out.width, out.height) / Math.max(factor, 1e-6); // short side with no enlargement
  const short = Math.max(MIN_SIDE, Math.floor(fits / 2 + 1e-6) * 2);
  return { factor, native: outputSize(out.aspect, short) };
}
