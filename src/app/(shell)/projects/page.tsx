"use client";
import { Flex, Typography } from "antd";
import PageHeader from "@/components/common/PageHeader";
import ActiveUploads from "@/components/upload/ActiveUploads";
import UploadCard from "@/components/upload/UploadCard";

export default function ProjectsPage() {
  return (
    <>
      <PageHeader title="New video" />
      <Flex vertical gap={16} style={{ maxWidth: 760, margin: "0 auto", padding: 16 }}>
        <Typography.Paragraph type="secondary" style={{ margin: 0 }}>
          Upload a talk, podcast, interview or lesson. Clipora prepares it, suggests ideas, and plans short clips you can
          adjust before anything is rendered.
        </Typography.Paragraph>
        <UploadCard />
        <ActiveUploads />
      </Flex>
    </>
  );
}
