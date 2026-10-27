import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";

dayjs.extend(relativeTime);

export function formatBytes(bytes: number): string {
  const gb = bytes / 1024 ** 3;
  if (gb >= 1) return `${gb.toFixed(1)} GB`;
  return `${Math.round(bytes / 1024 ** 2)} MB`;
}

export function mbLabel(mb: number): string {
  return mb >= 1024 ? `${+(mb / 1024).toFixed(1)} GB` : `${mb} MB`;
}

export function relative(iso: string): string {
  return dayjs(iso).fromNow();
}

/** SRT timecode, e.g. 00:01:02,400 */
export function srtTime(t: number): string {
  let ms = Math.max(0, Math.round(t * 1000));
  const h = Math.floor(ms / 3_600_000);
  ms -= h * 3_600_000;
  const m = Math.floor(ms / 60_000);
  ms -= m * 60_000;
  const s = Math.floor(ms / 1000);
  ms -= s * 1000;
  const p = (n: number, w = 2) => String(n).padStart(w, "0");
  return `${p(h)}:${p(m)}:${p(s)},${p(ms, 3)}`;
}

/** Short clock, e.g. 1:02.4 */
export function clock(t: number, tenths = false): string {
  const neg = t < 0;
  const v = Math.abs(t);
  const m = Math.floor(v / 60);
  const s = v - m * 60;
  const sec = tenths ? s.toFixed(1).padStart(4, "0") : String(Math.floor(s)).padStart(2, "0");
  return `${neg ? "-" : ""}${m}:${sec}`;
}

export type DateGroup = "Today" | "Yesterday" | "Previous 7 days" | "Older";

export function dateGroup(iso: string): DateGroup {
  const d = dayjs(iso);
  const today = dayjs().startOf("day");
  if (!d.isBefore(today)) return "Today";
  if (!d.isBefore(today.subtract(1, "day"))) return "Yesterday";
  if (!d.isBefore(today.subtract(7, "day"))) return "Previous 7 days";
  return "Older";
}

export function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

export function formatCost(cost: string | null | undefined): string {
  if (cost === null || cost === undefined) return "No price set";
  const v = Number(cost);
  return `$${v < 1 ? v.toFixed(4) : v.toFixed(2)}`;
}
