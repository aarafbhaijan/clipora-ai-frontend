"use client";
// Import from YouTube: paste a link and the server fetches the video into Clipora (ingest stage "fetch").
// Nothing is downloaded to the user's computer; the same length and size limits as an upload apply.
import { LinkOutlined, YoutubeFilled } from "@ant-design/icons";
import { Alert, Button, Card, Flex, Input, theme, Typography } from "antd";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { errorMessage } from "@/api/client";
import { useImportYoutube } from "@/api/hooks";

// Mirrors backend core.youtube.youtube_id; the server checks again.
const YOUTUBE = /^(https?:\/\/)?((www|m|music)\.)?(youtube\.com\/(watch\?.*v=|shorts\/|live\/|embed\/)|youtu\.be\/)[A-Za-z0-9_-]{11}/i;

export default function YoutubeImport({ disabled }: { disabled?: boolean }) {
  const { token } = theme.useToken();
  const router = useRouter();
  const importVideo = useImportYoutube();
  const [url, setUrl] = useState("");
  const [problem, setProblem] = useState<string | null>(null);

  const submit = () => {
    const link = url.trim();
    setProblem(null);
    if (!YOUTUBE.test(link)) return setProblem("Paste a YouTube video link, like https://www.youtube.com/watch?v=… or https://youtu.be/…");
    importVideo.mutate(link, {
      onSuccess: (out) => {
        setUrl("");
        router.push(`/projects/${out.project_id}`);
      },
      onError: (e) => setProblem(errorMessage(e)),
    });
  };

  return (
    <Card>
      <Flex vertical gap={12}>
        <Flex align="center" gap={10}>
          <YoutubeFilled style={{ fontSize: 22, color: token.colorError }} />
          <Typography.Text strong>Import from YouTube</Typography.Text>
        </Flex>
        <Typography.Text type="secondary">
          Paste a link and Clipora fetches the video directly on its server. Nothing downloads to your computer.
        </Typography.Text>
        <Flex gap={8}>
          <Input
            size="large"
            allowClear
            prefix={<LinkOutlined style={{ color: token.colorTextTertiary }} />}
            placeholder="https://www.youtube.com/watch?v=…"
            value={url}
            disabled={disabled || importVideo.isPending}
            onChange={(e) => setUrl(e.target.value)}
            onPressEnter={submit}
            aria-label="YouTube link"
          />
          <Button size="large" type="primary" loading={importVideo.isPending} disabled={disabled || !url.trim()} onClick={submit}>
            Import
          </Button>
        </Flex>
        {problem ? <Alert type="error" showIcon title={problem} closable={{ onClose: () => setProblem(null) }} /> : null}
        <Typography.Text type="secondary" style={{ fontSize: token.fontSizeSM }}>
          Import only videos you own or have permission to use.
        </Typography.Text>
      </Flex>
    </Card>
  );
}
