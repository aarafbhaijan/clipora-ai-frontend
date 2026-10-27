"use client";
// Mute button and volume slider for the editor's players. The value lives in the player store, so the
// preview's two layers and the original-video player always play at the same volume.
import { MutedOutlined, SoundOutlined } from "@ant-design/icons";
import { Button, Flex, Slider, Tooltip } from "antd";
import { useEffect } from "react";
import { usePlayer } from "@/lib/playerStore";

export default function VolumeControl() {
  const volume = usePlayer((s) => s.volume);
  const muted = usePlayer((s) => s.muted);
  const set = usePlayer((s) => s.set);
  const silent = muted || volume === 0;
  return (
    <Flex align="center" gap={4} style={{ width: 132, flexShrink: 0 }}>
      <Tooltip title={silent ? "Unmute" : "Mute"}>
        <Button
          type="text"
          size="small"
          icon={silent ? <MutedOutlined /> : <SoundOutlined />}
          aria-label={silent ? "Unmute" : "Mute"}
          aria-pressed={muted}
          onClick={() => set(silent && volume === 0 ? { muted: false, volume: 0.5 } : { muted: !muted })}
        />
      </Tooltip>
      <Slider
        style={{ flex: 1, margin: "0 4px" }}
        min={0}
        max={100}
        value={muted ? 0 : Math.round(volume * 100)}
        tooltip={{ formatter: (v) => `${v}%` }}
        onChange={(v) => set({ volume: v / 100, muted: v === 0 })}
        aria-label="Volume"
      />
    </Flex>
  );
}

/** Keep these video elements at the store's volume and mute. Call with a getter for the elements. */
export function useApplyVolume(videos: () => (HTMLVideoElement | null)[]) {
  const volume = usePlayer((s) => s.volume);
  const muted = usePlayer((s) => s.muted);
  useEffect(() => {
    for (const v of videos()) {
      if (!v) continue;
      v.volume = volume;
      v.muted = muted;
    }
  });
  return { volume, muted };
}
