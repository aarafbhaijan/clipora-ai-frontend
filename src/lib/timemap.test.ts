import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { EDL } from "@/api/types";
import { cropWindow, outputSize } from "./aspect";
import { interpolateCrop } from "./crop";
import { outToSrc, outputDuration, segmentTimings, srcToOut } from "./timemap";

interface Vector {
  name: string;
  edl: EDL;
  output_duration: number;
  t_out_starts: number[];
  src_to_out: { src: number; t_out: number | null }[];
  out_to_src: { t_out: number; hits: [number, number][] }[];
}

const vectorsPath = path.resolve(__dirname, "../../../backend/packages/core/src/core/vectors/timemap.json");
const vectors = JSON.parse(readFileSync(vectorsPath, "utf8")) as Vector[];

describe("timemap matches the Python vectors", () => {
  for (const v of vectors) {
    it(v.name, () => {
      expect(outputDuration(v.edl)).toBeCloseTo(v.output_duration, 6);
      segmentTimings(v.edl).forEach((s, i) => expect(s.tOutStart).toBeCloseTo(v.t_out_starts[i], 6));
      for (const q of v.src_to_out) {
        const got = srcToOut(v.edl, q.src);
        if (q.t_out === null) expect(got).toBeNull();
        else expect(got).toBeCloseTo(q.t_out, 6);
      }
      for (const q of v.out_to_src) {
        const got = outToSrc(v.edl, q.t_out).map(([i, s]) => [i, Math.round(s * 1e6) / 1e6]);
        expect(got).toEqual(q.hits);
      }
    });
  }
});

describe("aspect and crop", () => {
  it("matches core.aspect", () => {
    const [w, h] = cropWindow(1920, 1080, 1080, 1920);
    expect(w).toBeCloseTo(0.3164, 4);
    expect(h).toBe(1);
    expect(outputSize("9:16")).toEqual([1080, 1920]);
    expect(outputSize("21:9")).toEqual([2520, 1080]);
  });
  it("interpolates keyframes linearly", () => {
    const k = [
      { t: 0, cx: 0.2, cy: 0.5, zoom: 1 },
      { t: 1, cx: 0.4, cy: 0.5, zoom: 1 },
    ];
    expect(interpolateCrop(k, 0.5).cx).toBeCloseTo(0.3);
    expect(interpolateCrop(k, 2).cx).toBe(0.4);
  });
});
