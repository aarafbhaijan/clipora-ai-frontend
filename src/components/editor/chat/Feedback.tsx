"use client";
// Thumbs up/down with an optional reason after thumbs down (design.md "Chat").
import { Actions } from "@ant-design/x";
import { App, Button, Flex, Input, Popover, Tag, Typography } from "antd";
import { useState } from "react";
import { errorMessage } from "@/api/client";
import { useFeedback } from "@/api/hooks";

const REASONS: Record<string, string[]> = {
  plan: ["Boring clip", "Wrong length", "Bad cut point", "Wrong moments", "Wrong framing"],
  idea: ["Not interesting", "Wrong topic", "Too long", "Too short"],
  metadata: ["Not accurate", "Wrong tone", "Too long", "Wrong platform"],
  answer: ["Wrong moment", "Not what I asked", "Missed something"],
};

interface Props {
  projectId: string;
  kind: "plan" | "idea" | "metadata" | "answer";
  targetRef: string;
}

export default function Feedback({ projectId, kind, targetRef }: Props) {
  const { message } = App.useApp();
  const send = useFeedback(projectId);
  const [value, setValue] = useState<"like" | "dislike" | "default">("default");
  const [asking, setAsking] = useState(false);
  const [reasons, setReasons] = useState<string[]>([]);
  const [note, setNote] = useState("");

  const submit = (signal: "up" | "down", reason?: string) =>
    send.mutate(
      { target_kind: kind, target_ref: targetRef, signal, reason },
      { onError: (e) => message.error(errorMessage(e)) },
    );

  return (
    <Popover
      open={asking}
      onOpenChange={(o) => !o && setAsking(false)}
      trigger="click"
      title="What was wrong? (optional)"
      content={
        <Flex vertical gap={8} style={{ maxWidth: 280 }}>
          <Flex wrap gap={4}>
            {(REASONS[kind] ?? []).map((r) => (
              <Tag.CheckableTag
                key={r}
                checked={reasons.includes(r)}
                onChange={(on) => setReasons((x) => (on ? [...x, r] : x.filter((y) => y !== r)))}
              >
                {r}
              </Tag.CheckableTag>
            ))}
          </Flex>
          <Input.TextArea rows={2} maxLength={300} placeholder="Anything else?" value={note} onChange={(e) => setNote(e.target.value)} />
          <Flex justify="end" gap={8}>
            <Button size="small" onClick={() => setAsking(false)}>
              Skip
            </Button>
            <Button
              size="small"
              type="primary"
              onClick={() => {
                const reason = [...reasons, note.trim()].filter(Boolean).join("; ");
                if (reason) submit("down", reason);
                setAsking(false);
                setReasons([]);
                setNote("");
              }}
            >
              Send
            </Button>
          </Flex>
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            This helps Clipora learn your style. You can turn learning off in settings.
          </Typography.Text>
        </Flex>
      }
    >
      <span>
        <Actions.Feedback
          value={value}
          onChange={(v) => {
            setValue(v);
            if (v === "like") submit("up");
            if (v === "dislike") {
              submit("down");
              setAsking(true);
            }
          }}
        />
      </span>
    </Popover>
  );
}
