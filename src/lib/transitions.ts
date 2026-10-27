// Mirror of backend/packages/core/src/core/transitions.py (the catalogue). Keep the two in step.
import type { TransitionType } from "@/api/types";

export type PreviewKind =
  | "switch"
  | "opacity"
  | "dip_black"
  | "dip_white"
  | "translate_left"
  | "translate_right"
  | "clip_left"
  | "clip_right"
  | "clip_circle"
  | "scale_fade";

export interface TransitionSpec {
  type: TransitionType;
  label: string;
  preview: PreviewKind;
  approximate: boolean;
}

export const CATALOGUE: TransitionSpec[] = [
  { type: "cut", label: "Cut", preview: "switch", approximate: false },
  { type: "fade", label: "Fade", preview: "opacity", approximate: false },
  { type: "dip_black", label: "Dip to black", preview: "dip_black", approximate: false },
  { type: "dip_white", label: "Dip to white", preview: "dip_white", approximate: false },
  { type: "dissolve", label: "Dissolve", preview: "opacity", approximate: true },
  { type: "slide_left", label: "Slide left", preview: "translate_left", approximate: false },
  { type: "slide_right", label: "Slide right", preview: "translate_right", approximate: false },
  { type: "wipe_left", label: "Wipe left", preview: "clip_left", approximate: false },
  { type: "wipe_right", label: "Wipe right", preview: "clip_right", approximate: false },
  { type: "circle_open", label: "Circle open", preview: "clip_circle", approximate: true },
  { type: "zoom_in", label: "Zoom in", preview: "scale_fade", approximate: true },
  { type: "pixelize", label: "Pixelize", preview: "opacity", approximate: true },
];

export const SPEC: Record<TransitionType, TransitionSpec> = Object.fromEntries(
  CATALOGUE.map((s) => [s.type, s]),
) as Record<TransitionType, TransitionSpec>;

export const MIN_DURATION_S = 0.1;
export const MAX_DURATION_S = 2.0;

export interface LayerStyle {
  opacity?: number;
  transform?: string;
  clipPath?: string;
}

/** CSS for the outgoing (a) and incoming (b) layers at progress p in [0, 1], plus a dip overlay opacity. */
export function transitionStyles(
  type: TransitionType,
  p: number,
): { a: LayerStyle; b: LayerStyle; dip: number; dipWhite: boolean } {
  const q = Math.min(1, Math.max(0, p));
  const kind = SPEC[type]?.preview ?? "opacity";
  switch (kind) {
    case "switch":
      return { a: { opacity: q < 1 ? 1 : 0 }, b: { opacity: q >= 1 ? 1 : 0 }, dip: 0, dipWhite: false };
    case "dip_black":
    case "dip_white":
      return {
        a: { opacity: q < 0.5 ? 1 : 0 },
        b: { opacity: q >= 0.5 ? 1 : 0 },
        dip: 1 - Math.abs(q - 0.5) * 2,
        dipWhite: kind === "dip_white",
      };
    case "translate_left":
      return { a: { transform: `translateX(${-q * 100}%)` }, b: { transform: `translateX(${(1 - q) * 100}%)` }, dip: 0, dipWhite: false };
    case "translate_right":
      return { a: { transform: `translateX(${q * 100}%)` }, b: { transform: `translateX(${-(1 - q) * 100}%)` }, dip: 0, dipWhite: false };
    case "clip_left":
      return { a: {}, b: { clipPath: `inset(0 0 0 ${(1 - q) * 100}%)` }, dip: 0, dipWhite: false };
    case "clip_right":
      return { a: {}, b: { clipPath: `inset(0 ${(1 - q) * 100}% 0 0)` }, dip: 0, dipWhite: false };
    case "clip_circle":
      return { a: {}, b: { clipPath: `circle(${q * 75}% at 50% 50%)` }, dip: 0, dipWhite: false };
    case "scale_fade":
      return { a: { opacity: 1 - q, transform: `scale(${1 + q * 0.3})` }, b: { opacity: q }, dip: 0, dipWhite: false };
    default:
      return { a: { opacity: 1 - q }, b: { opacity: q }, dip: 0, dipWhite: false };
  }
}
