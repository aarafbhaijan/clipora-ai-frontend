"use client";
// Upload card (design.md "Upload limits"): quota bars, client-side checks, optional SRT as an attachment.
import { CloudUploadOutlined, FileTextOutlined, InboxOutlined } from "@ant-design/icons";
import { Attachments, type AttachmentsProps } from "@ant-design/x";
import { Alert, App, Card, Flex, Progress, Skeleton, Typography, Upload, theme } from "antd";
import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { keys, useMe } from "@/api/hooks";
import { formatBytes, mbLabel } from "@/lib/format";
import { readDuration, startUpload, uploadErrorMessage } from "@/lib/uploads";

const MB = 1024 * 1024;

export default function UploadCard() {
  const { token } = theme.useToken();
  const { message } = App.useApp();
  const router = useRouter();
  const qc = useQueryClient();
  const me = useMe();
  const [srt, setSrt] = useState<{ name: string; text: string } | null>(null);
  const [checking, setChecking] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  if (me.isLoading) return <Card><Skeleton active /></Card>;
  if (me.isError || !me.data)
    return <Alert type="error" showIcon title="Couldn't load your upload limits." action={<a onClick={() => me.refetch()}>Retry</a>} />;

  const limits = me.data.limits;
  const usage = me.data.usage;
  const maxVideos = limits.max_active_videos;
  const maxFileMb = limits.max_file_size_mb;
  const maxStorageMb = limits.max_storage_mb;
  const maxDuration = limits.max_video_duration_s;
  const storageLeft = maxStorageMb * MB - usage.storage_bytes;
  const fullVideos = usage.active_videos >= maxVideos;
  const fullStorage = storageLeft <= 0;
  const disabled = fullVideos || fullStorage || checking;

  const onFile = async (file: File) => {
    setProblem(null);
    if (!file.type.startsWith("video/")) return setProblem("Please choose a video file.");
    if (file.size > maxFileMb * MB) return setProblem(`This file is larger than ${mbLabel(maxFileMb)}.`);
    if (file.size > storageLeft) return setProblem("This upload would go over your storage limit. Delete a video to make room.");
    setChecking(true);
    const duration = await readDuration(file);
    setChecking(false);
    if (duration && duration > maxDuration)
      return setProblem(`This video is longer than ${Math.round(maxDuration / 60)} minutes.`);
    const title = file.name.replace(/\.[^.]+$/, "") || "Untitled video";
    startUpload({
      file,
      title,
      durationS: duration,
      srtText: srt?.text,
      onCreated: (id) => {
        setSrt(null);
        qc.invalidateQueries({ queryKey: keys.projects });
        qc.invalidateQueries({ queryKey: keys.me });
        router.push(`/projects/${id}`);
      },
      onDone: () => qc.invalidateQueries({ queryKey: keys.projects }),
    }).catch((e) => {
      setProblem(uploadErrorMessage(e));
      message.error(uploadErrorMessage(e));
      qc.invalidateQueries({ queryKey: keys.projects });
    });
  };

  const srtItems: AttachmentsProps["items"] = srt
    ? [{ uid: "srt", name: srt.name, status: "done", size: srt.text.length, icon: <FileTextOutlined /> }]
    : [];

  return (
    <Card>
      <Flex vertical gap={16}>
        <Flex gap={24} wrap>
          <div style={{ flex: "1 1 200px" }}>
            <Typography.Text>
              {usage.active_videos} of {maxVideos} videos
            </Typography.Text>
            <Progress percent={Math.min(100, (usage.active_videos / maxVideos) * 100)} showInfo={false} status={fullVideos ? "exception" : "normal"} />
          </div>
          <div style={{ flex: "1 1 200px" }}>
            <Typography.Text>
              {formatBytes(usage.storage_bytes)} of {mbLabel(maxStorageMb)}
            </Typography.Text>
            <Progress
              percent={Math.min(100, (usage.storage_bytes / (maxStorageMb * MB)) * 100)}
              showInfo={false}
              status={fullStorage ? "exception" : "normal"}
            />
          </div>
        </Flex>

        {fullVideos ? (
          <Alert type="warning" showIcon title={`You have ${usage.active_videos} videos. Delete one to upload another.`} />
        ) : fullStorage ? (
          <Alert type="warning" showIcon title="Your storage is full. Delete a video to make room." />
        ) : null}

        <Upload.Dragger
          accept="video/*"
          multiple={false}
          showUploadList={false}
          disabled={disabled}
          customRequest={({ file }) => onFile(file as File)}
          aria-label="Upload a video"
        >
          <p style={{ fontSize: 40, color: token.colorPrimary, margin: 0 }}>
            {checking ? <CloudUploadOutlined /> : <InboxOutlined />}
          </p>
          <Typography.Title level={5}>{checking ? "Checking the video…" : "Drop a video here or click to choose"}</Typography.Title>
          <Typography.Text type="secondary">
            Any aspect ratio, one main speaker. Up to {mbLabel(maxFileMb)} and {Math.round(maxDuration / 60)} minutes.
          </Typography.Text>
        </Upload.Dragger>

        {problem ? <Alert type="error" showIcon title={problem} closable={{ onClose: () => setProblem(null) }} /> : null}

        <div>
          <Typography.Text type="secondary">Optional: attach subtitles (.srt) and Clipora will skip transcription.</Typography.Text>
          <Attachments
            accept=".srt"
            maxCount={1}
            items={srtItems}
            disabled={disabled}
            beforeUpload={(file) => {
              file.text().then((text) => setSrt({ name: file.name, text }));
              return false;
            }}
            onRemove={() => setSrt(null)}
            placeholder={{ icon: <FileTextOutlined />, title: "Attach subtitles", description: "An .srt file for this video" }}
            style={{ marginTop: 8 }}
          />
        </div>
      </Flex>
    </Card>
  );
}
