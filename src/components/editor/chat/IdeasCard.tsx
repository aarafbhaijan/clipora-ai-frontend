"use client";
// The first thing on a new video: summary, topics and 4 to 6 idea cards (design.md "Chat").
import { BulbOutlined, ThunderboltOutlined } from "@ant-design/icons";
import { Prompts, Welcome } from "@ant-design/x";
import { Button, Flex, Tag, theme, Typography } from "antd";
import type { Suggestions } from "@/lib/messages";
import { usePlayer } from "@/lib/playerStore";
import Feedback from "./Feedback";

interface Props {
  projectId: string;
  messageId: string;
  data: Suggestions;
  disabled: boolean;
  onPick: (ideaId: string, title: string) => void;
  onMore: () => void;
}

export default function IdeasCard({ projectId, messageId, data, disabled, onPick, onMore }: Props) {
  const { token } = theme.useToken();
  const setPlayer = usePlayer((s) => s.set);

  return (
    <Flex vertical gap={12} style={{ width: "100%" }}>
      <Welcome
        variant="borderless"
        icon={<BulbOutlined style={{ fontSize: 24, color: token.colorPrimary }} />}
        title="Ideas for this video"
        description={data.summary ?? "Pick one to get a plan, or tell me what you want."}
        styles={{ root: { padding: 0 } }}
      />
      {data.topics.length ? (
        <Flex wrap gap={4}>
          {data.topics.map((t) => (
            <Tag key={t}>{t}</Tag>
          ))}
        </Flex>
      ) : null}
      <Prompts
        wrap
        items={data.ideas.map((idea) => ({
          key: idea.id,
          icon: <ThunderboltOutlined style={{ color: token.colorWarning }} />,
          disabled,
          label: (
            <span
              onMouseEnter={() => setPlayer({ highlights: idea.anchors.map((a) => ({ start: a.start_s, end: a.end_s })) })}
              onMouseLeave={() => setPlayer({ highlights: [] })}
            >
              {idea.title}
            </span>
          ),
          // Prompts renders the description inside a <p>, so everything here must be inline elements.
          description: (
            <Flex
              component="span"
              vertical
              gap={4}
              onMouseEnter={() => setPlayer({ highlights: idea.anchors.map((a) => ({ start: a.start_s, end: a.end_s })) })}
              onMouseLeave={() => setPlayer({ highlights: [] })}
            >
              {idea.why ? <span>{idea.why}</span> : null}
              <Flex component="span" gap={4} wrap>
                {idea.target_duration_s ? <Tag>{Math.round(idea.target_duration_s)} s</Tag> : null}
                {idea.aspect ? <Tag color="processing">{idea.aspect}</Tag> : null}
                {idea.style ? <Tag>{idea.style}</Tag> : null}
              </Flex>
              <Typography.Link>Make this</Typography.Link>
            </Flex>
          ),
        }))}
        onItemClick={({ data: item }) => {
          const idea = data.ideas.find((i) => i.id === item.key);
          if (idea) onPick(idea.id, idea.title);
        }}
        styles={{ item: { flex: "1 1 220px" } }}
      />
      <Flex justify="space-between" align="center">
        <Button size="small" onClick={onMore} disabled={disabled}>
          More ideas
        </Button>
        <Feedback projectId={projectId} kind="idea" targetRef={messageId} />
      </Flex>
    </Flex>
  );
}
