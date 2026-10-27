"use client";
// Metadata tab (design.md "Metadata tab"): title, thumbnail title (text only), description, platform,
// hashtags and domain. Every field is editable, copyable and can be rewritten with an instruction.
import { DownloadOutlined, HistoryOutlined, ReloadOutlined } from "@ant-design/icons";
import { Actions, Bubble, Prompts, Sender, Think, type BubbleItemType } from "@ant-design/x";
import { useQueryClient } from "@tanstack/react-query";
import {
  Alert,
  App,
  Button,
  Dropdown,
  Flex,
  Form,
  Input,
  Popover,
  Select,
  Skeleton,
  Tag,
  theme,
  Tooltip,
  Typography,
} from "antd";
import { useEffect, useMemo, useRef, useState } from "react";
import { ApiError, api, errorMessage, unwrap } from "@/api/client";
import { keys, useMetadata } from "@/api/hooks";
import type { MetadataSetOut } from "@/api/types";
import { relative } from "@/lib/format";
import { readChoices } from "@/lib/messages";
import { downloadText } from "@/lib/transcript";
import { ErrorState } from "../../common/States";
import Feedback from "../chat/Feedback";

const PLATFORM_HINTS = ["YouTube Shorts", "TikTok", "Instagram Reels", "LinkedIn", "X", "Facebook Reels"];
const TONES = ["neutral", "casual", "punchy", "professional"] as const;

interface PlatformPick {
  platform: string;
  reason?: string;
}
interface Fields {
  title: string;
  title_alternates: string[];
  thumbnail_title: string;
  thumbnail_alternates: string[];
  description: string;
  platform: PlatformPick;
  platform_alternates: PlatformPick[];
  hashtags: string[];
  domain: string;
  subtopic?: string | null;
}

function readFields(set: MetadataSetOut): Fields {
  const f = set.fields as Partial<Fields>;
  return {
    title: f.title ?? "",
    title_alternates: f.title_alternates ?? [],
    thumbnail_title: f.thumbnail_title ?? "",
    thumbnail_alternates: f.thumbnail_alternates ?? [],
    description: f.description ?? "",
    platform: f.platform ?? { platform: set.platform ?? "" },
    platform_alternates: f.platform_alternates ?? [],
    hashtags: f.hashtags ?? [],
    domain: f.domain ?? "",
    subtopic: f.subtopic ?? null,
  };
}

function asText(f: Fields): string {
  return [
    `Platform: ${f.platform.platform}`,
    `Title: ${f.title}`,
    `Thumbnail title: ${f.thumbnail_title}`,
    "",
    f.description,
    "",
    f.hashtags.join(" "),
    "",
    `Domain: ${f.domain}${f.subtopic ? ` / ${f.subtopic}` : ""}`,
  ].join("\n");
}

function RefreshButton({ label, onRun }: { label: string; onRun: (instruction: string) => void }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  return (
    <Popover
      open={open}
      onOpenChange={setOpen}
      trigger="click"
      title={`Rewrite the ${label}`}
      content={
        <Flex vertical gap={8} style={{ width: 260 }}>
          <Input
            placeholder="Optional: how should it change?"
            value={text}
            onChange={(e) => setText(e.target.value)}
            onPressEnter={() => {
              onRun(text);
              setOpen(false);
              setText("");
            }}
          />
          <Button
            type="primary"
            size="small"
            onClick={() => {
              onRun(text);
              setOpen(false);
              setText("");
            }}
          >
            Rewrite
          </Button>
        </Flex>
      }
    >
      <Tooltip title={`Rewrite the ${label}`}>
        <Button size="small" type="text" icon={<ReloadOutlined />} aria-label={`Rewrite the ${label}`} />
      </Tooltip>
    </Popover>
  );
}

export default function MetadataPanel({ projectId, hasPlan, title }: { projectId: string; hasPlan: boolean; title: string }) {
  const { token } = theme.useToken();
  const { message } = App.useApp();
  const qc = useQueryClient();
  const meta = useMetadata(projectId, hasPlan);
  const [form] = Form.useForm<Fields>();
  const [startForm] = Form.useForm<{ platform?: string; language?: string; tone?: string; notes?: string }>();
  const [chat, setChat] = useState("");
  const [sending, setSending] = useState(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const current = meta.data?.current ?? null;
  const job = meta.data?.active_job;
  const busy = job?.status === "queued" || job?.status === "running";
  const waiting = job?.status === "waiting_input";

  const fields = useMemo(() => (current ? readFields(current) : null), [current]);

  useEffect(() => {
    if (fields) form.setFieldsValue(fields);
  }, [fields, form]);

  const refresh = () => qc.invalidateQueries({ queryKey: keys.metadata(projectId) });

  const sendMessage = async (content: string) => {
    if (!content.trim()) return;
    setSending(true);
    try {
      await unwrap(
        api.POST("/api/projects/{project_id}/metadata/messages", {
          params: { path: { project_id: projectId } },
          body: { content },
        }),
      );
      setChat("");
      refresh();
    } catch (e) {
      message.error(errorMessage(e));
    } finally {
      setSending(false);
    }
  };

  const start = async (opts: { platform?: string; language?: string; tone?: string; notes?: string }) => {
    try {
      await unwrap(
        api.POST("/api/projects/{project_id}/metadata", {
          params: { path: { project_id: projectId } },
          body: {
            platform: opts.platform && opts.platform !== "auto" ? opts.platform : undefined,
            language: opts.language || undefined,
            tone: (opts.tone as (typeof TONES)[number]) || undefined,
            notes: opts.notes || undefined,
          },
        }),
      );
      refresh();
    } catch (e) {
      message.error(errorMessage(e));
    }
  };

  const save = async (next: Fields, platform?: string) => {
    if (!current) return;
    try {
      await unwrap(
        api.PATCH("/api/projects/{project_id}/metadata", {
          params: { path: { project_id: projectId }, header: { "If-Match": current.version } },
          body: { fields: next as unknown as Record<string, unknown>, platform },
        }),
      );
      refresh();
    } catch (e) {
      if (e instanceof ApiError && e.code === "version_conflict") {
        message.warning("The text was updated. Showing the latest version.");
        refresh();
      } else message.error(errorMessage(e));
    }
  };

  const onEdit = () => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      form
        .validateFields()
        .then((v) => fields && save({ ...fields, ...v }))
        .catch(() => undefined);
    }, 800);
  };

  if (!hasPlan)
    return (
      <Typography.Paragraph type="secondary" style={{ padding: 16 }}>
        Make a plan first. Then Clipora can write the title, description and hashtags for it.
      </Typography.Paragraph>
    );
  if (meta.isLoading) return <Skeleton active style={{ padding: 16 }} />;
  if (meta.isError && !meta.data) return <ErrorState error={meta.error} onRetry={() => meta.refetch()} />;

  const messages = meta.data?.messages ?? [];
  const chatItems: BubbleItemType[] = messages.map((m) => ({
    key: m.id,
    role: m.role === "user" ? "user" : "ai",
    content: m.content,
    footer:
      m.kind === "choices" && waiting && m.id === messages[messages.length - 1]?.id ? (
        <Prompts wrap items={readChoices(m).map((c) => ({ key: c, label: c }))} onItemClick={({ data }) => sendMessage(String(data.key))} />
      ) : undefined,
  }));

  return (
    <Flex vertical style={{ height: "100%", minHeight: 0 }}>
      <div style={{ flex: 1, minHeight: 0, overflow: "auto", padding: 12 }}>
        {meta.data?.stale && current ? (
          <Alert
            type="info"
            showIcon
            title="The plan changed after this text was written."
            action={
              <Button size="small" disabled={busy} onClick={() => start({ platform: current.platform ?? undefined, tone: current.tone ?? undefined, language: current.language ?? undefined })}>
                Update
              </Button>
            }
            style={{ marginBottom: 12 }}
          />
        ) : null}

        {busy ? <Think title="Writing your title and hashtags" loading blink style={{ marginBottom: 12 }} /> : null}

        {!current && !busy && !waiting ? (
          <Form form={startForm} layout="vertical" onFinish={start} initialValues={{ platform: "auto", tone: "neutral" }}>
            <Form.Item name="platform" label="Platform">
              <Select
                options={[{ label: "Let Clipora choose", value: "auto" }, ...PLATFORM_HINTS.map((p) => ({ label: p, value: p }))]}
              />
            </Form.Item>
            <Form.Item name="language" label="Language" extra="Leave empty to use the video's language.">
              <Input placeholder="e.g. English" />
            </Form.Item>
            <Form.Item name="tone" label="Tone">
              <Select options={TONES.map((t) => ({ label: t[0].toUpperCase() + t.slice(1), value: t }))} />
            </Form.Item>
            <Form.Item name="notes" label="Notes">
              <Input.TextArea rows={2} maxLength={1000} placeholder="Anything to mention or avoid" />
            </Form.Item>
            <Button type="primary" htmlType="submit">
              Write title and hashtags
            </Button>
          </Form>
        ) : null}

        {current && fields ? (
          <Form form={form} layout="vertical" onValuesChange={onEdit} disabled={busy}>
            <Flex justify="space-between" align="center" style={{ marginBottom: 8 }} wrap gap={8}>
              <Flex gap={4} wrap>
                {[fields.platform, ...fields.platform_alternates].map((p, i) => (
                  <Tooltip key={p.platform} title={p.reason}>
                    <Tag
                      color={i === 0 ? "processing" : undefined}
                      style={{ cursor: i === 0 ? "default" : "pointer" }}
                      onClick={() => i > 0 && sendMessage(`Switch the platform to ${p.platform}`)}
                    >
                      {i === 0 ? "Recommended: " : ""}
                      {p.platform}
                    </Tag>
                  </Tooltip>
                ))}
              </Flex>
              <Flex gap={4}>
                <Dropdown
                  menu={{
                    items: (meta.data?.versions ?? []).map((v) => ({
                      key: String(v.version),
                      label: `Version ${v.version} · ${v.author === "user" ? "you" : "Clipora"} · ${relative(v.created_at)}`,
                      disabled: v.version === current.version,
                    })),
                    onClick: ({ key }) => {
                      const v = meta.data?.versions.find((x) => String(x.version) === key);
                      if (v) save(readFields(v), v.platform ?? undefined);
                    },
                  }}
                >
                  <Button size="small" icon={<HistoryOutlined />}>
                    Versions
                  </Button>
                </Dropdown>
                <Actions.Copy text={asText(fields)} />
                <Tooltip title="Download .txt">
                  <Button
                    size="small"
                    type="text"
                    icon={<DownloadOutlined />}
                    aria-label="Download as text"
                    onClick={() => downloadText(`${title || "metadata"}.txt`, asText(fields))}
                  />
                </Tooltip>
              </Flex>
            </Flex>

            <Form.Item
              label={
                <Flex gap={4} align="center">
                  Title <RefreshButton label="title" onRun={(i) => sendMessage(`Rewrite the title${i ? `: ${i}` : ""}`)} />
                  <Actions.Copy text={fields.title} />
                </Flex>
              }
              name="title"
              rules={[{ required: true, message: "Add a title" }]}
              extra={
                fields.title_alternates.length ? (
                  <Flex gap={4} wrap style={{ marginTop: 4 }}>
                    {fields.title_alternates.map((t) => (
                      <Tag key={t} style={{ cursor: "pointer" }} onClick={() => save({ ...fields, title: t, title_alternates: [fields.title, ...fields.title_alternates.filter((x) => x !== t)].slice(0, 2) })}>
                        {t}
                      </Tag>
                    ))}
                  </Flex>
                ) : null
              }
            >
              <Input showCount />
            </Form.Item>

            <Form.Item
              label={
                <Flex gap={4} align="center">
                  Thumbnail title <RefreshButton label="thumbnail title" onRun={(i) => sendMessage(`Rewrite the thumbnail title${i ? `: ${i}` : ""}`)} />
                  <Actions.Copy text={fields.thumbnail_title} />
                </Flex>
              }
              name="thumbnail_title"
              rules={[
                { required: true, message: "Add a thumbnail title" },
                { max: 28, message: "At most 28 characters" },
                {
                  validator: (_, v: string) => {
                    const n = (v ?? "").trim().split(/\s+/).filter(Boolean).length;
                    return n >= 2 && n <= 5 ? Promise.resolve() : Promise.reject(new Error("Use 2 to 5 words"));
                  },
                },
              ]}
              extra={
                <Flex vertical gap={4} style={{ marginTop: 4 }}>
                  <span>Text for the thumbnail. Clipora doesn&apos;t make images.</span>
                  {fields.thumbnail_alternates.length ? (
                    <Flex gap={4} wrap>
                      {fields.thumbnail_alternates.map((t) => (
                        <Tag key={t} style={{ cursor: "pointer" }} onClick={() => save({ ...fields, thumbnail_title: t, thumbnail_alternates: [fields.thumbnail_title, ...fields.thumbnail_alternates.filter((x) => x !== t)].slice(0, 2) })}>
                          {t}
                        </Tag>
                      ))}
                    </Flex>
                  ) : null}
                </Flex>
              }
            >
              <Input showCount maxLength={28} />
            </Form.Item>

            <Form.Item
              label={
                <Flex gap={4} align="center">
                  Description <RefreshButton label="description" onRun={(i) => sendMessage(`Rewrite the description${i ? `: ${i}` : ""}`)} />
                  <Actions.Copy text={fields.description} />
                </Flex>
              }
              name="description"
            >
              <Input.TextArea autoSize={{ minRows: 3, maxRows: 8 }} showCount />
            </Form.Item>

            <Form.Item
              label={
                <Flex gap={4} align="center">
                  Hashtags <RefreshButton label="hashtags" onRun={(i) => sendMessage(`Rewrite the hashtags${i ? `: ${i}` : ""}`)} />
                  <Actions.Copy text={fields.hashtags.join(" ")} />
                </Flex>
              }
              name="hashtags"
              extra="3 to 8 tags, each starting with #."
              rules={[
                {
                  validator: (_, v: string[]) =>
                    v && v.length >= 3 && v.length <= 8 ? Promise.resolve() : Promise.reject(new Error("Use 3 to 8 hashtags")),
                },
              ]}
              normalize={(v: string[]) => v.map((h) => (h.startsWith("#") ? h : `#${h}`).replace(/\s+/g, ""))}
            >
              <Select mode="tags" open={false} tokenSeparators={[" ", ","]} placeholder="Type a tag and press Enter" />
            </Form.Item>

            <Flex gap={8}>
              <Form.Item label="Domain" name="domain" style={{ flex: 1 }}>
                <Input />
              </Form.Item>
              <Form.Item label="Subtopic" name="subtopic" style={{ flex: 1 }}>
                <Input placeholder="Optional" />
              </Form.Item>
            </Flex>
            <Flex justify="end">
              <Feedback projectId={projectId} kind="metadata" targetRef={String(current.version)} />
            </Flex>
          </Form>
        ) : null}

        {chatItems.length ? (
          <div style={{ marginTop: 12, borderTop: `1px solid ${token.colorBorderSecondary}`, paddingTop: 8 }}>
            <Bubble.List
              items={chatItems}
              role={{ ai: { placement: "start", variant: "outlined" }, user: { placement: "end", variant: "filled" } }}
            />
          </div>
        ) : null}
      </div>
      {current || waiting ? (
        <div style={{ padding: 8 }}>
          <Sender
            value={chat}
            loading={busy || sending}
            onChange={setChat}
            onSubmit={sendMessage}
            placeholder="Ask for a change, e.g. “make the title punchier”"
          />
        </div>
      ) : null}
    </Flex>
  );
}
