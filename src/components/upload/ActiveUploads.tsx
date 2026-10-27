"use client";
import { Card, Flex, List, Progress, Typography } from "antd";
import { percentOf, useUploads } from "@/lib/uploads";

const STATUS_TEXT = { starting: "Starting", uploading: "Uploading", finishing: "Finishing", done: "Uploaded", failed: "Upload failed" };

export default function ActiveUploads() {
  const items = Object.values(useUploads((s) => s.items));
  if (!items.length) return null;
  return (
    <Card title="Uploads" size="small">
      <List
        dataSource={items}
        renderItem={(u) => (
          <List.Item>
            <Flex vertical style={{ width: "100%" }}>
              <Flex justify="space-between">
                <Typography.Text ellipsis>{u.title}</Typography.Text>
                <Typography.Text type={u.status === "failed" ? "danger" : "secondary"}>
                  {u.error ?? STATUS_TEXT[u.status]}
                </Typography.Text>
              </Flex>
              <Progress
                percent={percentOf(u)}
                status={u.status === "failed" ? "exception" : u.status === "done" ? "success" : "active"}
              />
            </Flex>
          </List.Item>
        )}
      />
    </Card>
  );
}
