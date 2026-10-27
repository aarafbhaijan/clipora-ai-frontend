// transcript.json shape written by ingest (backend/packages/core/src/core/transcript.py).
export interface Word {
  text: string;
  start: number;
  end: number;
}
export interface Cue {
  id: string;
  start: number;
  end: number;
  text: string;
  words: Word[];
}
export interface Transcript {
  language: string | null;
  cues: Cue[];
}

export function wordBoundaries(t: Transcript | undefined): number[] {
  if (!t) return [];
  const pts = new Set<number>();
  for (const c of t.cues) {
    const spans = c.words.length ? c.words : [c];
    for (const w of spans) {
      pts.add(w.start);
      pts.add(w.end);
    }
  }
  return [...pts].sort((a, b) => a - b);
}

/** Nearest boundary within `within` seconds, else the time itself. */
export function snapTo(t: number, boundaries: number[], within: number): number {
  if (!boundaries.length) return t;
  let lo = 0;
  let hi = boundaries.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (boundaries[mid] <= t) lo = mid;
    else hi = mid;
  }
  const best = Math.abs(boundaries[lo] - t) <= Math.abs(boundaries[hi] - t) ? boundaries[lo] : boundaries[hi];
  return Math.abs(best - t) <= within ? best : t;
}

export function toSrt(cues: Cue[], edits: Record<string, string> = {}): string {
  const fmt = (t: number) => {
    let ms = Math.round(t * 1000);
    const h = Math.floor(ms / 3_600_000);
    ms -= h * 3_600_000;
    const m = Math.floor(ms / 60_000);
    ms -= m * 60_000;
    const s = Math.floor(ms / 1000);
    ms -= s * 1000;
    const p = (n: number, w = 2) => String(n).padStart(w, "0");
    return `${p(h)}:${p(m)}:${p(s)},${p(ms, 3)}`;
  };
  return cues.map((c, i) => `${i + 1}\n${fmt(c.start)} --> ${fmt(c.end)}\n${edits[c.id] ?? c.text}\n`).join("\n");
}

export function cueAt(cues: Cue[], t: number): Cue | undefined {
  let lo = 0;
  let hi = cues.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const c = cues[mid];
    if (t < c.start) hi = mid - 1;
    else if (t >= c.end) lo = mid + 1;
    else return c;
  }
  return undefined;
}

export function downloadText(filename: string, text: string, type = "text/plain"): void {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
