"use client";
// Speakers lane: who talks when across the whole video (lip movement matched to the voice, architecture.md
// section 12.1). One colour per person; hover for the time, click to jump there. Shown while the Speaker
// boxes are on.
import { TeamOutlined } from "@ant-design/icons";
import { Flex, theme, Tooltip } from "antd";
import type { GlobalToken } from "antd";
import type { SpeakerOut } from "@/api/types";
import { clock } from "@/lib/format";
import { personIndex } from "@/lib/speakers";

export const SPEAKER_ROW_H = 24;
const PALETTE = ["blue6", "magenta6", "gold6", "cyan6", "purple6", "lime6"] as const;

export function personColor(token: GlobalToken, index: number): string {
  return token[PALETTE[index % PALETTE.length]];
}

/** Label-column cell for the lane. */
export function SpeakerLaneLabel() {
  const { token } = theme.useToken();
  return (
    <Tooltip title="Who is talking (from lip movement)" placement="right">
      <Flex
        align="center"
        justify="center"
        style={{ height: SPEAKER_ROW_H, color: token.colorTextSecondary, borderTop: `1px solid ${token.colorBorderSecondary}` }}
      >
        <TeamOutlined />
      </Flex>
    </Tooltip>
  );
}

export default function SpeakerLane({
  speaker,
  durationS,
  at,
  onSeek,
  inset = 0,
}: {
  speaker: SpeakerOut;
  durationS: number;
  /** Current source time, for the marker. */
  at: number;
  onSeek: (src: number) => void;
  /** Horizontal margin (px) so the lane lines up with the row above it. */
  inset?: number | string;
}) {
  const { token } = theme.useToken();
  const dur = Math.max(durationS, 0.1);
  const pct = (t: number) => `${(t / dur) * 100}%`;
  const colors = personIndex(speaker);
  return (
    <div
      role="list"
      aria-label="Who is talking"
      style={{
        position: "relative",
        height: SPEAKER_ROW_H,
        margin: typeof inset === "number" ? `0 ${inset}px` : inset,
        borderTop: `1px solid ${token.colorBorderSecondary}`,
        flexShrink: 0,
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: "5px 0",
          borderRadius: token.borderRadiusSM,
          background: token.colorFillQuaternary,
          cursor: "pointer",
        }}
        onClick={(e) => {
          if (e.target !== e.currentTarget) return;
          const rect = e.currentTarget.getBoundingClientRect();
          onSeek(((e.clientX - rect.left) / rect.width) * dur);
        }}
      >
        {speaker.turns.map((turn) => (
          <Tooltip key={`${turn.track_id}-${turn.start}`} title={`${turn.label} · ${clock(turn.start)}–${clock(turn.end)}`}>
            <div
              role="listitem"
              tabIndex={0}
              aria-label={`${turn.label} talks from ${clock(turn.start)} to ${clock(turn.end)}`}
              onClick={() => onSeek(turn.start)}
              onKeyDown={(e) => (e.key === "Enter" ? onSeek(turn.start) : undefined)}
              style={{
                position: "absolute",
                left: pct(turn.start),
                width: pct(turn.end - turn.start),
                minWidth: 3,
                top: 2,
                bottom: 2,
                borderRadius: 2,
                background: personColor(token, colors.get(turn.track_id) ?? 0),
                opacity: 0.55 + 0.45 * turn.confidence,
                cursor: "pointer",
              }}
            />
          </Tooltip>
        ))}
        <div
          aria-hidden
          style={{
            position: "absolute",
            left: pct(Math.min(Math.max(at, 0), dur)),
            top: -3,
            bottom: -3,
            width: 2,
            background: token.colorError,
            pointerEvents: "none",
          }}
        />
      </div>
    </div>
  );
}
