"use client";
// Aspect picker (design.md "Aspect picker"): presets, custom size, and Crop or Fit.
import { WarningOutlined } from "@ant-design/icons";
import { Button, Flex, InputNumber, Popover, Segmented, Tooltip, Typography } from "antd";
import { useState } from "react";
import type { EDL, Framing } from "@/api/types";
import { aspectLabel, enlargement, MAX_SIDE, MIN_SIDE, outputSize, PRESETS } from "@/lib/aspect";
import { setAspect } from "@/lib/edlOps";
import { useEditor } from "@/lib/editorStore";

const even = (n: number) => Math.round(n / 2) * 2;
const SOFT_FROM = 1.3; // enlarging more than this makes a visibly softer picture

export default function AspectPicker({ projectId, edl, disabled }: { projectId: string; edl: EDL; disabled: boolean }) {
  const edit = useEditor((s) => s.edit);
  const out = edl.output ?? { aspect: "9:16", width: 1080, height: 1920, framing: "crop" as Framing, fps: 30 };
  const isPreset = (PRESETS as readonly string[]).includes(out.aspect);
  const [w, setW] = useState(out.width);
  const [h, setH] = useState(out.height);

  const apply = (aspect: string, width: number, height: number, framing: Framing) =>
    edit(projectId, (d) => setAspect(d as EDL, aspect, width, height, framing));
  const { factor, native } = enlargement(edl.source.width, edl.source.height, out);
  const soft = factor > SOFT_FROM;

  const custom = (
    <Flex vertical gap={8}>
      <Flex gap={8} align="center">
        <InputNumber min={MIN_SIDE} max={MAX_SIDE} step={2} value={w} onChange={(v) => setW(v ?? w)} aria-label="Width" />
        <Typography.Text>×</Typography.Text>
        <InputNumber min={MIN_SIDE} max={MAX_SIDE} step={2} value={h} onChange={(v) => setH(v ?? h)} aria-label="Height" />
      </Flex>
      <Typography.Text type="secondary" style={{ fontSize: 12 }}>
        Even numbers, {MIN_SIDE} to {MAX_SIDE} pixels.
      </Typography.Text>
      {factor > 1.05 ? (
        <Flex vertical gap={4} style={{ maxWidth: 280 }}>
          <Typography.Text type={soft ? "warning" : "secondary"} style={{ fontSize: 12 }}>
            Your video is {edl.source.width}×{edl.source.height}, so {out.width}×{out.height} enlarges it{" "}
            {factor.toFixed(1)}×. Enlarging adds no detail. A higher-resolution upload looks sharper.
          </Typography.Text>
          <Button
            size="small"
            disabled={disabled}
            onClick={() => {
              setW(native[0]);
              setH(native[1]);
              apply(out.aspect, native[0], native[1], out.framing);
            }}
          >
            Use source size ({native[0]}×{native[1]})
          </Button>
        </Flex>
      ) : null}
      <Button
        type="primary"
        size="small"
        onClick={() => {
          const ww = Math.min(MAX_SIDE, Math.max(MIN_SIDE, even(w)));
          const hh = Math.min(MAX_SIDE, Math.max(MIN_SIDE, even(h)));
          apply(aspectLabel(ww, hh), ww, hh, out.framing);
        }}
      >
        Apply
      </Button>
    </Flex>
  );

  return (
    <Flex gap={8} align="center" wrap>
      <Segmented
        size="small"
        disabled={disabled}
        value={isPreset ? out.aspect : "custom"}
        options={[...PRESETS.map((p) => ({ label: p, value: p })), { label: "Custom", value: "custom" }]}
        onChange={(v) => {
          if (v === "custom") return;
          const [ww, hh] = outputSize(String(v));
          apply(String(v), ww, hh, out.framing);
        }}
        aria-label="Aspect ratio"
      />
      <Popover content={custom} title="Custom size" trigger="click">
        <Tooltip title={soft ? `Enlarged ${factor.toFixed(1)}× from your video, so it looks softer. Click for options.` : undefined}>
          <Button size="small" disabled={disabled} icon={soft ? <WarningOutlined /> : undefined}>
            {out.width}×{out.height}
          </Button>
        </Tooltip>
      </Popover>
      <Tooltip title="Crop fills the frame and follows the speaker. Fit shows the whole picture over a blurred copy.">
        <Segmented
          size="small"
          disabled={disabled}
          value={out.framing}
          options={[
            { label: "Crop", value: "crop" },
            { label: "Fit", value: "fit" },
          ]}
          onChange={(v) => apply(out.aspect, out.width, out.height, v as Framing)}
          aria-label="Framing"
        />
      </Tooltip>
    </Flex>
  );
}
