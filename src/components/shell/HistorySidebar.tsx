"use client";
// History sidebar (design.md section 6): every video with a live state chip. Switching never stops work.
import {
  CrownOutlined,
  DeleteOutlined,
  EditOutlined,
  EllipsisOutlined,
  LogoutOutlined,
  PlusOutlined,
  SettingOutlined,
  VideoCameraOutlined,
} from "@ant-design/icons";
import { Conversations, notification as xNotification, type ConversationsProps } from "@ant-design/x";
import { App, Avatar, Badge, Button, Dropdown, Flex, Input, Modal, Progress, Spin, theme, Tooltip, Typography } from "antd";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { errorMessage } from "@/api/client";
import { ACTIVE_STATES, useDeleteProject, useMe, useProjects, useRenameProject } from "@/api/hooks";
import type { HistoryState, ProjectListItem } from "@/api/types";
import { signOut } from "@/lib/auth";
import { dateGroup, relative } from "@/lib/format";
import { chipFor } from "@/lib/states";
import { percentOf, useUploads } from "@/lib/uploads";

const GROUP_ORDER = ["Today", "Yesterday", "Previous 7 days", "Older"];

/** One quiet status line: a coloured dot with text (colour is never the only signal), then the time. */
function StatusLine({
  item,
  uploadPercent,
  interrupted,
}: {
  item: ProjectListItem;
  uploadPercent?: number;
  interrupted: boolean;
}) {
  const { token } = theme.useToken();
  const chip = interrupted
    ? { text: "Upload interrupted", color: "error" as const, active: false, percent: undefined }
    : chipFor(item, uploadPercent);
  const pct = chip.active && chip.percent !== undefined ? ` ${Math.round(chip.percent)}%` : "";
  return (
    <Flex vertical gap={2} style={{ minWidth: 0 }}>
      <Flex align="center" gap={6} style={{ minWidth: 0, fontSize: token.fontSizeSM, lineHeight: 1.4 }}>
        <Badge status={chip.color} />
        <Typography.Text
          type={chip.color === "default" || chip.color === "success" ? "secondary" : undefined}
          style={{ fontSize: token.fontSizeSM, color: chip.color === "warning" ? token.colorWarningText : undefined }}
          ellipsis
        >
          {chip.text}
          {pct}
          <Typography.Text type="secondary" style={{ fontSize: token.fontSizeSM }}>
            {" · "}
            {relative(item.updated_at)}
          </Typography.Text>
        </Typography.Text>
      </Flex>
      {chip.active && chip.percent !== undefined ? (
        <Progress percent={chip.percent} size={{ height: 3 }} showInfo={false} style={{ margin: 0, lineHeight: 0 }} />
      ) : null}
    </Flex>
  );
}

function Thumb({ url }: { url: string | null | undefined }) {
  const { token } = theme.useToken();
  const box: React.CSSProperties = {
    width: 56,
    height: 32,
    borderRadius: token.borderRadiusSM,
    flexShrink: 0,
    background: token.colorFillTertiary,
  };
  return url ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={url} alt="" style={{ ...box, objectFit: "cover", display: "block" }} />
  ) : (
    <Flex align="center" justify="center" style={box}>
      <VideoCameraOutlined style={{ color: token.colorTextTertiary }} />
    </Flex>
  );
}

/** Toast with an Open button when a video that is not open finishes in the background. */
function useFinishToasts(items: ProjectListItem[], openId: string | null) {
  const { notification } = App.useApp();
  const router = useRouter();
  const prev = useRef<Map<string, HistoryState>>(new Map());
  useEffect(() => {
    const before = prev.current;
    const next = new Map(items.map((i) => [i.id, i.state]));
    for (const item of items) {
      const was = before.get(item.id);
      if (!was || !ACTIVE_STATES.includes(was) || ACTIVE_STATES.includes(item.state) || item.id === openId) continue;
      const failed = item.state === "failed";
      const text = failed
        ? `${item.title} could not be finished.`
        : item.state === "exported"
          ? `${item.title} is exported and ready to download.`
          : `${item.title} is ready.`;
      notification.open({
        type: failed ? "error" : "success",
        title: failed ? "Something went wrong" : "Ready",
        description: text,
        actions: (
          <Button type="primary" size="small" onClick={() => router.push(`/projects/${item.id}`)}>
            Open
          </Button>
        ),
      });
      if (typeof document !== "undefined" && document.hidden && xNotification.permission === "granted") {
        xNotification.open({ title: "Clipora AI", body: text, tag: item.id });
      }
    }
    prev.current = next;
  }, [items, openId, notification, router]);
}

export default function HistorySidebar({ onNavigate }: { onNavigate?: () => void }) {
  const { token } = theme.useToken();
  const router = useRouter();
  const pathname = usePathname();
  const { modal, message } = App.useApp();
  const openId = pathname?.startsWith("/projects/") ? pathname.split("/")[2] : null;
  const me = useMe();
  const projects = useProjects();
  const uploads = useUploads((s) => s.items);
  const rename = useRenameProject();
  const del = useDeleteProject();
  const [filter, setFilter] = useState("");
  const [renaming, setRenaming] = useState<ProjectListItem | null>(null);
  const [newTitle, setNewTitle] = useState("");

  const all = useMemo(() => projects.data?.pages.flatMap((p) => p.items) ?? [], [projects.data]);
  useFinishToasts(all, openId);

  const visible = filter ? all.filter((p) => p.title.toLowerCase().includes(filter.toLowerCase())) : all;

  const items: ConversationsProps["items"] = visible
    .slice()
    .sort((a, b) => GROUP_ORDER.indexOf(dateGroup(a.created_at)) - GROUP_ORDER.indexOf(dateGroup(b.created_at)))
    .map((p) => {
      const up = uploads[p.id];
      const interrupted = p.state === "uploading" && !up;
      return {
        key: p.id,
        group: dateGroup(p.created_at),
        label: (
          <Flex align="center" gap={10} style={{ minWidth: 0, paddingBlock: 2 }}>
            <Thumb url={p.thumbnail_url} />
            <Flex vertical gap={1} style={{ minWidth: 0, flex: 1 }}>
              <Typography.Text ellipsis={{ tooltip: p.title }} style={{ fontWeight: 500 }}>
                {p.title}
              </Typography.Text>
              <StatusLine item={p} uploadPercent={up ? percentOf(up) : undefined} interrupted={interrupted} />
            </Flex>
          </Flex>
        ),
      };
    });

  const confirmDelete = (p: ProjectListItem) =>
    modal.confirm({
      title: `Delete "${p.title}"?`,
      content: "The video, its plan and its exports will be removed. This frees one upload slot.",
      okText: "Delete",
      okButtonProps: { danger: true },
      onOk: async () => {
        try {
          await del.mutateAsync(p.id);
          if (openId === p.id) router.push("/projects");
        } catch (e) {
          message.error(errorMessage(e));
        }
      },
    });

  const onScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const el = e.currentTarget;
    if (el.scrollHeight - el.scrollTop - el.clientHeight < 80 && projects.hasNextPage && !projects.isFetchingNextPage) {
      projects.fetchNextPage();
    }
  };

  return (
    <Flex vertical style={{ height: "100%" }}>
      <Flex align="center" justify="space-between" style={{ padding: "16px 16px 8px" }}>
        <Typography.Title level={5} style={{ margin: 0 }}>
          Clipora AI
        </Typography.Title>
        <Tooltip title="New video">
          <Button
            type="primary"
            shape="circle"
            icon={<PlusOutlined />}
            aria-label="New video"
            onClick={() => {
              router.push("/projects");
              onNavigate?.();
            }}
          />
        </Tooltip>
      </Flex>
      <div style={{ padding: "0 12px 8px" }}>
        <Input.Search allowClear placeholder="Filter videos" value={filter} onChange={(e) => setFilter(e.target.value)} />
      </div>
      <div style={{ flex: 1, overflow: "auto" }} onScroll={onScroll}>
        {projects.isLoading ? (
          <Flex justify="center" style={{ padding: 24 }}>
            <Spin />
          </Flex>
        ) : projects.isError && !all.length ? (
          <Flex vertical align="center" gap={8} style={{ padding: 24 }}>
            <Typography.Text type="secondary">Couldn&apos;t load your videos.</Typography.Text>
            <Button size="small" onClick={() => projects.refetch()}>
              Retry
            </Button>
          </Flex>
        ) : !visible.length ? (
          <Typography.Paragraph type="secondary" style={{ padding: 16 }}>
            {filter ? "No videos match this filter." : "No videos yet. Upload one to get started."}
          </Typography.Paragraph>
        ) : (
          <Conversations
            items={items}
            activeKey={openId ?? undefined}
            groupable
            onActiveChange={(key) => {
              router.push(`/projects/${key}`);
              onNavigate?.();
            }}
            menu={(conv) => {
              const p = all.find((x) => x.id === conv.key);
              return {
                items: [
                  { key: "rename", label: "Rename", icon: <EditOutlined /> },
                  { key: "delete", label: "Delete", icon: <DeleteOutlined />, danger: true },
                ],
                onClick: ({ key, domEvent }) => {
                  domEvent.stopPropagation();
                  if (!p) return;
                  if (key === "rename") {
                    setNewTitle(p.title);
                    setRenaming(p);
                  } else confirmDelete(p);
                },
              };
            }}
          />
        )}
        {projects.isFetchingNextPage ? (
          <Flex justify="center" style={{ padding: 8 }}>
            <Spin size="small" />
          </Flex>
        ) : null}
        {projects.isError && all.length ? (
          <Typography.Paragraph type="warning" style={{ padding: "0 16px", fontSize: token.fontSizeSM }}>
            Can&apos;t refresh right now. Showing the last known state.
          </Typography.Paragraph>
        ) : null}
      </div>
      <div style={{ padding: 8, borderTop: `1px solid ${token.colorBorderSecondary}` }}>
        <Dropdown
          trigger={["click"]}
          placement="topLeft"
          menu={{
            items: [
              ...(me.data?.role === "admin" ? [{ key: "admin", label: "Admin", icon: <CrownOutlined /> }] : []),
              { key: "settings", label: "What Clipora has learned", icon: <SettingOutlined /> },
              { type: "divider" as const },
              { key: "signout", label: "Sign out", icon: <LogoutOutlined /> },
            ],
            onClick: ({ key }) => {
              if (key === "admin") router.push("/admin");
              else if (key === "settings") router.push("/settings");
              else if (key === "signout") signOut();
              onNavigate?.();
            },
          }}
        >
          <Button type="text" block style={{ height: "auto", padding: 8, justifyContent: "flex-start" }} aria-label="Account menu">
            <Flex align="center" gap={10} style={{ minWidth: 0, width: "100%" }}>
              <Avatar size="small" style={{ background: token.colorPrimary, flexShrink: 0 }}>
                {(me.data?.email ?? "?").charAt(0).toUpperCase()}
              </Avatar>
              <Typography.Text ellipsis style={{ flex: 1, textAlign: "left", fontSize: token.fontSizeSM }}>
                {me.data?.email ?? "Account"}
              </Typography.Text>
              <EllipsisOutlined style={{ color: token.colorTextTertiary }} />
            </Flex>
          </Button>
        </Dropdown>
      </div>
      <Modal
        open={!!renaming}
        title="Rename video"
        okText="Save"
        confirmLoading={rename.isPending}
        onCancel={() => setRenaming(null)}
        onOk={async () => {
          if (!renaming || !newTitle.trim()) return;
          try {
            await rename.mutateAsync({ id: renaming.id, title: newTitle.trim() });
            setRenaming(null);
          } catch (e) {
            message.error(errorMessage(e));
          }
        }}
      >
        <Input value={newTitle} maxLength={200} onChange={(e) => setNewTitle(e.target.value)} autoFocus />
      </Modal>
    </Flex>
  );
}
