"use client";
// Full-quality preview: the players normally use the editor copy (720 px, light, quick to seek). This plays the
// original upload instead, to check sharpness. Display only: the export always renders from the original.
import { HighlightOutlined } from "@ant-design/icons";
import { App, Button, Tooltip } from "antd";
import { usePlayer } from "@/lib/playerStore";

/** The URL a player should load, and an error handler that falls back to the editor copy. */
export function useVideoSrc(proxyUrl: string | null | undefined, sourceUrl: string | null | undefined) {
  const { message } = App.useApp();
  const full = usePlayer((s) => s.fullQuality);
  const original = full && !!sourceUrl;
  return {
    src: original ? sourceUrl : proxyUrl,
    /** True when the error was the original file and the player switched back to the editor copy. */
    fellBack: (): boolean => {
      if (!original) return false;
      usePlayer.getState().set({ fullQuality: false });
      message.warning("Your original file can't play in this browser, so the editor copy is shown. The export is not affected.");
      return true;
    },
  };
}

/** Button above the video that switches between the editor copy and the original upload. */
export function QualityToggle() {
  const on = usePlayer((s) => s.fullQuality);
  const set = usePlayer((s) => s.set);
  return (
    <Tooltip
      title={
        on
          ? "Showing your original video. Click to go back to the lighter editor copy."
          : "Show your original video at full quality. Sharper, but slower to load and seek. The export always uses the original."
      }
    >
      <Button
        size="small"
        type={on ? "primary" : "default"}
        icon={<HighlightOutlined />}
        aria-pressed={on}
        onClick={() => set({ fullQuality: !on })}
      >
        Full quality
      </Button>
    </Tooltip>
  );
}
