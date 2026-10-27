"use client";
// What Clipora has learned (design.md "Settings"): edit, disable or delete preferences; switch learning off.
import { DeleteOutlined, EditOutlined } from "@ant-design/icons";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { App, Button, Card, Flex, Input, List, Popconfirm, Switch, Tag, Tooltip, Typography } from "antd";
import { useState } from "react";
import { api, errorMessage, unwrap } from "@/api/client";
import { keys, useMe, useMemories } from "@/api/hooks";
import type { MemoryOut } from "@/api/types";
import PageHeader from "../common/PageHeader";
import { EmptyState, ErrorState, Loading } from "../common/States";

const KIND_LABEL: Record<string, string> = {
  length: "Length",
  aspect: "Shape",
  style: "Style",
  transitions: "Transitions",
  titles: "Titles",
  avoid: "Avoid",
};

export default function SettingsPage() {
  const { message } = App.useApp();
  const qc = useQueryClient();
  const me = useMe();
  const memories = useMemories();
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState("");

  const patchMe = useMutation({
    mutationFn: (learn: boolean) => unwrap(api.PATCH("/api/me", { body: { learn_enabled: learn } })),
    onSuccess: (data) => qc.setQueryData(keys.me, data),
    onError: (e) => message.error(errorMessage(e)),
  });
  const patchMemory = useMutation({
    mutationFn: ({ id, body }: { id: string; body: { text?: string; status?: "active" | "disabled" } }) =>
      unwrap(api.PATCH("/api/memories/{memory_id}", { params: { path: { memory_id: id } }, body })),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.memories }),
    onError: (e) => message.error(errorMessage(e)),
  });
  const deleteMemory = useMutation({
    mutationFn: (id: string) => unwrap(api.DELETE("/api/memories/{memory_id}", { params: { path: { memory_id: id } } })),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.memories }),
    onError: (e) => message.error(errorMessage(e)),
  });

  const render = (m: MemoryOut) => (
    <List.Item
      actions={[
        <Tooltip key="on" title={m.status === "disabled" ? "Use this again" : "Stop using this"}>
          <Switch
            size="small"
            checked={m.status === "active"}
            disabled={m.status === "pending"}
            onChange={(on) => patchMemory.mutate({ id: m.id, body: { status: on ? "active" : "disabled" } })}
            aria-label="Use this preference"
          />
        </Tooltip>,
        <Button
          key="edit"
          size="small"
          type="text"
          icon={<EditOutlined />}
          aria-label="Edit"
          onClick={() => {
            setEditing(m.id);
            setDraft(m.text);
          }}
        />,
        <Popconfirm key="del" title="Delete this preference?" okText="Delete" okButtonProps={{ danger: true }} onConfirm={() => deleteMemory.mutate(m.id)}>
          <Button size="small" type="text" danger icon={<DeleteOutlined />} aria-label="Delete" />
        </Popconfirm>,
      ]}
    >
      <Flex vertical gap={4} style={{ width: "100%" }}>
        <Flex gap={6}>
          <Tag>{KIND_LABEL[m.kind] ?? m.kind}</Tag>
          {m.status === "pending" ? <Tag color="warning">Waiting for your OK</Tag> : null}
          {m.status === "disabled" ? <Tag>Off</Tag> : null}
        </Flex>
        {editing === m.id ? (
          <Flex gap={8}>
            <Input value={draft} maxLength={300} onChange={(e) => setDraft(e.target.value)} autoFocus />
            <Button
              type="primary"
              onClick={() => {
                if (draft.trim()) patchMemory.mutate({ id: m.id, body: { text: draft.trim() } });
                setEditing(null);
              }}
            >
              Save
            </Button>
            <Button onClick={() => setEditing(null)}>Cancel</Button>
          </Flex>
        ) : (
          <Typography.Text type={m.status === "disabled" ? "secondary" : undefined}>{m.text}</Typography.Text>
        )}
      </Flex>
    </List.Item>
  );

  return (
    <>
      <PageHeader title="What Clipora has learned" />
      <Flex vertical gap={16} style={{ maxWidth: 760, margin: "0 auto", padding: 16 }}>
        <Card>
          <Flex justify="space-between" align="center" gap={16}>
            <div>
              <Typography.Text strong>Learn from my edits</Typography.Text>
              <Typography.Paragraph type="secondary" style={{ margin: 0 }}>
                Clipora notices how you change its plans and your thumbs, and turns them into short preferences. It
                asks before saving anything it guessed. Your videos are not used to train models.
              </Typography.Paragraph>
            </div>
            <Switch
              checked={me.data?.learn_enabled ?? false}
              loading={me.isLoading || patchMe.isPending}
              onChange={(v) => patchMe.mutate(v)}
              aria-label="Learn from my edits"
            />
          </Flex>
        </Card>
        <Card title="Preferences">
          {memories.isLoading ? (
            <Loading />
          ) : memories.isError ? (
            <ErrorState error={memories.error} onRetry={() => memories.refetch()} />
          ) : !memories.data?.length ? (
            <EmptyState text="Nothing learned yet. Keep editing and giving thumbs, and preferences will show up here." />
          ) : (
            <List dataSource={memories.data} renderItem={render} />
          )}
        </Card>
      </Flex>
    </>
  );
}
