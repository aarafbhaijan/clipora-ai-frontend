"use client";
// Before there is a plan: turn the whole video into another shape (portrait by default) in one click, with the
// crop following whoever talks, and export it. No AI needed. It becomes an edited video like any other.
import { ExportOutlined, ExpandOutlined } from "@ant-design/icons";
import { App, Button, Flex, Segmented, theme, Tooltip, Typography } from "antd";
import { useState } from "react";
import { errorMessage } from "@/api/client";
import { useReframe } from "@/api/hooks";

const SHAPES = [
  { value: "9:16", label: "9:16 Portrait" },
  { value: "4:5", label: "4:5" },
  { value: "1:1", label: "1:1" },
];

export default function ReframeBar({ projectId, onReady }: { projectId: string; onReady: (exportNow: boolean) => void }) {
  const { token } = theme.useToken();
  const { message } = App.useApp();
  const reframe = useReframe(projectId);
  const [aspect, setAspect] = useState("9:16");
  const [pending, setPending] = useState<"convert" | "export" | null>(null);

  const run = (exportNow: boolean) => {
    setPending(exportNow ? "export" : "convert");
    reframe.mutate(
      { aspect },
      {
        onSuccess: () => {
          message.success(`Your whole video is now ${aspect}, following the speaker.`);
          onReady(exportNow);
        },
        onError: (e) => message.error(errorMessage(e)),
        onSettled: () => setPending(null),
      },
    );
  };

  return (
    <Flex
      align="center"
      gap={12}
      wrap
      style={{
        margin: "8px 8px 0",
        padding: "10px 12px",
        border: `1px solid ${token.colorBorderSecondary}`,
        borderRadius: token.borderRadiusLG,
        background: token.colorBgElevated,
      }}
    >
      <Flex vertical style={{ flex: "1 1 220px", minWidth: 0 }}>
        <Typography.Text strong>Convert the whole video</Typography.Text>
        <Typography.Text type="secondary" style={{ fontSize: token.fontSizeSM }}>
          Reframe it to a new shape. The frame follows whoever is talking. No AI short needed.
        </Typography.Text>
      </Flex>
      <Segmented size="small" value={aspect} onChange={(v) => setAspect(String(v))} options={SHAPES} aria-label="New shape" />
      <Flex gap={8}>
        <Tooltip title="Make the converted video, then adjust it in the editor">
          <Button icon={<ExpandOutlined />} loading={pending === "convert"} disabled={!!pending} onClick={() => run(false)}>
            Convert
          </Button>
        </Tooltip>
        <Button type="primary" icon={<ExportOutlined />} loading={pending === "export"} disabled={!!pending} onClick={() => run(true)}>
          Convert &amp; export
        </Button>
      </Flex>
    </Flex>
  );
}
