"use client";
import { Divider, Flex, Typography } from "antd";
import PageHeader from "@/components/common/PageHeader";
import ActiveUploads from "@/components/upload/ActiveUploads";
import UploadCard from "@/components/upload/UploadCard";
import YoutubeImport from "@/components/upload/YoutubeImport";

export default function ProjectsPage() {
  return (
    <>
      <PageHeader title="New video" />
      <Flex vertical gap={16} style={{ maxWidth: 760, margin: "0 auto", padding: 16 }}>
        <Typography.Paragraph type="secondary" style={{ margin: 0 }}>
          Upload a talk, podcast, interview or lesson, or import one from YouTube. Clipora prepares it, suggests ideas, and plans short clips you can
          adjust before anything is rendered.
        </Typography.Paragraph>
        <YoutubeImport />
        <Divider plain style={{ margin: 0 }}>
          <Typography.Text type="secondary">or upload a file</Typography.Text>
        </Divider>
        <UploadCard />
        <ActiveUploads />
      </Flex>
    </>
  );
}
