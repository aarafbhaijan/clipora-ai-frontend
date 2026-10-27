"use client";
// Export (design.md "Export drawer"): renders once, shows progress, then the MP4 and SRT downloads.
import { DownloadOutlined, ExportOutlined, FileTextOutlined } from "@ant-design/icons";
import { useQueryClient } from "@tanstack/react-query";
import { Alert, App, Button, Drawer, Flex, Progress, Result, Typography } from "antd";
import { useState } from "react";
import { api, errorMessage, unwrap } from "@/api/client";
import { keys, useExport } from "@/api/hooks";
import type { ProjectDetail } from "@/api/types";
import { clock } from "@/lib/format";
import { STAGE_LABEL } from "@/lib/states";

interface Props {
  project: ProjectDetail;
  open: boolean;
  onClose: () => void;
  outputSeconds: number;
  unsaved: boolean;
  onWriteMetadata: () => void;
}

export default function ExportDrawer({ project, open, onClose, outputSeconds, unsaved, onWriteMetadata }: Props) {
  const { message } = App.useApp();
  const qc = useQueryClient();
  const [exportId, setExportId] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const shownId = exportId ?? project.last_export?.id ?? null;
  const exp = useExport(shownId);
  const e = exp.data;

  const start = async () => {
    setStarting(true);
    try {
      const out = await unwrap(
        api.POST("/api/projects/{project_id}/exports", { params: { path: { project_id: project.id } }, body: {} }),
      );
      setExportId(out.id);
      qc.invalidateQueries({ queryKey: keys.project(project.id) });
      qc.invalidateQueries({ queryKey: keys.projects });
    } catch (err) {
      message.error(errorMessage(err));
    } finally {
      setStarting(false);
    }
  };

  const running = e && (e.status === "queued" || e.status === "rendering");
  const stale = e && e.edl_version !== project.current_version;

  return (
    <Drawer open={open} onClose={onClose} title="Export" size={420}>
      <Flex vertical gap={16}>
        <Typography.Paragraph type="secondary" style={{ margin: 0 }}>
          Clipora renders your plan once: {clock(outputSeconds)} long, with captions and transitions burned in.
        </Typography.Paragraph>
        {unsaved ? <Alert type="info" showIcon title="Saving your latest changes first…" /> : null}

        {exp.isLoading && shownId ? <Progress percent={0} status="active" /> : null}

        {running ? (
          <Flex vertical gap={8}>
            <Typography.Text>
              {e.stage ? STAGE_LABEL[e.stage] ?? "Rendering" : e.status === "queued" ? "Waiting to start" : "Rendering"}
            </Typography.Text>
            <Progress percent={e.percent} status="active" />
            <Typography.Text type="secondary">You can keep editing or open another video. We&apos;ll let you know.</Typography.Text>
          </Flex>
        ) : null}

        {e?.status === "done" ? (
          <Result
            status="success"
            title="Your short is ready"
            subTitle={stale ? "The plan has changed since this export. Export again to include your changes." : undefined}
            extra={
              <Flex vertical gap={8}>
                <Button type="primary" icon={<DownloadOutlined />} href={e.download_url ?? undefined} disabled={!e.download_url}>
                  Download MP4
                </Button>
                <Button icon={<FileTextOutlined />} href={e.srt_url ?? undefined} disabled={!e.srt_url}>
                  Download subtitles (.srt)
                </Button>
                <Button type="link" onClick={onWriteMetadata}>
                  Write title and hashtags
                </Button>
              </Flex>
            }
          />
        ) : null}

        {e?.status === "failed" ? (
          <Result status="error" title="The export didn't finish" subTitle="No partial files were kept. Try again." />
        ) : null}

        {exp.isError ? <Alert type="warning" showIcon title="Can't check the export right now. Retrying…" /> : null}

        {!running ? (
          <Button
            type={e?.status === "done" && !stale ? "default" : "primary"}
            icon={<ExportOutlined />}
            loading={starting}
            disabled={unsaved || !project.current_version}
            onClick={start}
            block
          >
            {e ? "Export again" : "Export video"}
          </Button>
        ) : null}
      </Flex>
    </Drawer>
  );
}
