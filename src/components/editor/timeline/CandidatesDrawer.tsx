"use client";
// Rejected candidates (design.md "Timeline"): good moments the plan did not use, each with a preview.
import { CaretRightOutlined, PlusOutlined } from "@ant-design/icons";
import { Button, Drawer, Empty, Flex, List, Typography } from "antd";
import type { Candidate } from "@/api/types";
import { clock } from "@/lib/format";
import type { Transcript } from "@/lib/transcript";

interface Props {
  open: boolean;
  onClose: () => void;
  candidates: Candidate[];
  transcript: Transcript | undefined;
  onPreview: (c: Candidate) => void;
  onAdd: (c: Candidate) => void;
  full: boolean;
}

function excerpt(t: Transcript | undefined, c: Candidate): string {
  if (!t) return "";
  const text = t.cues
    .filter((q) => q.end > c.src_start && q.start < c.src_end)
    .map((q) => q.text)
    .join(" ");
  return text.length > 160 ? `${text.slice(0, 160)}…` : text;
}

export default function CandidatesDrawer({ open, onClose, candidates, transcript, onPreview, onAdd, full }: Props) {
  return (
    <Drawer open={open} onClose={onClose} title="More moments" size={420}>
      {!candidates.length ? (
        <Empty description="No other moments yet. Ask in the chat for more options." />
      ) : (
        <List
          dataSource={candidates}
          renderItem={(c) => (
            <List.Item
              actions={[
                <Button key="play" icon={<CaretRightOutlined />} onClick={() => onPreview(c)} aria-label="Preview this moment">
                  Preview
                </Button>,
                <Button key="add" type="primary" icon={<PlusOutlined />} disabled={full} onClick={() => onAdd(c)}>
                  Add
                </Button>,
              ]}
            >
              <List.Item.Meta
                title={
                  <Flex gap={8}>
                    <span>
                      {clock(c.src_start)}–{clock(c.src_end)}
                    </span>
                    <Typography.Text type="secondary">{(c.src_end - c.src_start).toFixed(1)} s</Typography.Text>
                  </Flex>
                }
                description={
                  <>
                    {c.reason ? <div>{c.reason}</div> : null}
                    <Typography.Text type="secondary" italic>
                      {excerpt(transcript, c)}
                    </Typography.Text>
                  </>
                }
              />
            </List.Item>
          )}
        />
      )}
    </Drawer>
  );
}
