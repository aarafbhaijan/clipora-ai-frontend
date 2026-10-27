"use client";
// Editor media: transcript.json and the waveform (min/max int8 per 50 ms, 20 per second, gzip).
import { useQuery } from "@tanstack/react-query";
import type { Transcript } from "@/lib/transcript";

export function useTranscript(url: string | null | undefined, projectId: string) {
  return useQuery({
    queryKey: ["transcript", projectId],
    enabled: !!url,
    staleTime: Infinity,
    queryFn: async () => {
      const res = await fetch(url!);
      if (!res.ok) throw new Error("Couldn't load the transcript.");
      return (await res.json()) as Transcript;
    },
  });
}

export interface Waveform {
  perSecond: number;
  min: Int8Array;
  max: Int8Array;
}

async function gunzipIfNeeded(buf: ArrayBuffer): Promise<ArrayBuffer> {
  const b = new Uint8Array(buf);
  if (b.length > 2 && b[0] === 0x1f && b[1] === 0x8b) {
    const stream = new Blob([b]).stream().pipeThrough(new DecompressionStream("gzip"));
    return await new Response(stream).arrayBuffer();
  }
  return buf; // already decoded by the browser (Content-Encoding: gzip)
}

export function useWaveform(url: string | null | undefined, projectId: string) {
  return useQuery({
    queryKey: ["waveform", projectId],
    enabled: !!url,
    staleTime: Infinity,
    queryFn: async (): Promise<Waveform> => {
      const res = await fetch(url!);
      if (!res.ok) throw new Error("Couldn't load the waveform.");
      const data = new Int8Array(await gunzipIfNeeded(await res.arrayBuffer()));
      // Interleaved [min, max] pairs.
      const n = Math.floor(data.length / 2);
      const min = new Int8Array(n);
      const max = new Int8Array(n);
      for (let i = 0; i < n; i++) {
        min[i] = data[2 * i];
        max[i] = data[2 * i + 1];
      }
      return { perSecond: 20, min, max };
    },
  });
}
