"use client";
// Our own pointer-drag hook for the timeline (design.md section 9: no drag-and-drop library).
import { useCallback, useEffect, useRef } from "react";

export interface DragInfo {
  dx: number;
  dy: number;
  clientX: number;
  clientY: number;
  shiftKey: boolean;
}

interface Handlers<T> {
  onStart?: (data: T, e: React.PointerEvent) => void;
  onMove: (data: T, info: DragInfo) => void;
  onEnd?: (data: T, info: DragInfo, moved: boolean) => void;
  threshold?: number;
}

export function usePointerDrag<T>({ onStart, onMove, onEnd, threshold = 3 }: Handlers<T>) {
  const state = useRef<{ x: number; y: number; data: T; moved: boolean } | null>(null);
  const handlers = useRef({ onStart, onMove, onEnd });
  useEffect(() => {
    handlers.current = { onStart, onMove, onEnd };
  });

  return useCallback(
    (data: T) => (e: React.PointerEvent) => {
      if (e.button !== 0) return;
      e.stopPropagation();
      const target = e.currentTarget as HTMLElement;
      target.setPointerCapture(e.pointerId);
      state.current = { x: e.clientX, y: e.clientY, data, moved: false };
      handlers.current.onStart?.(data, e);

      const info = (ev: PointerEvent): DragInfo => ({
        dx: ev.clientX - (state.current?.x ?? 0),
        dy: ev.clientY - (state.current?.y ?? 0),
        clientX: ev.clientX,
        clientY: ev.clientY,
        shiftKey: ev.shiftKey,
      });
      const move = (ev: PointerEvent) => {
        const s = state.current;
        if (!s) return;
        const i = info(ev);
        if (!s.moved && Math.hypot(i.dx, i.dy) < threshold) return;
        s.moved = true;
        handlers.current.onMove(s.data, i);
      };
      const up = (ev: PointerEvent) => {
        const s = state.current;
        target.removeEventListener("pointermove", move);
        target.removeEventListener("pointerup", up);
        target.removeEventListener("pointercancel", up);
        state.current = null;
        if (s) handlers.current.onEnd?.(s.data, info(ev), s.moved);
      };
      target.addEventListener("pointermove", move);
      target.addEventListener("pointerup", up);
      target.addEventListener("pointercancel", up);
    },
    [threshold],
  );
}
