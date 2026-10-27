"use client";
// Generated videos: every plan the AI makes is a short with its own id (edl.meta.short). Revisions and user edits
// keep that id, so plan versions group into shorts. The "Edited videos" tab lists them as cards; chat plan replies
// show one as a Think block. Opening a short (or one of its clips) makes it the plan in the editor: playback stops
// first, then the player jumps to that clip, so nothing plays from the source or keeps playing behind.
import { CheckCircleFilled, DownOutlined, EditOutlined, RightOutlined, VideoCameraAddOutlined } from "@ant-design/icons";
import { Think } from "@ant-design/x";
import { App, Button, Empty, Flex, Spin, Tag, theme, Typography } from "antd";
import { useEffect, useMemo } from "react";
import { create } from "zustand";
import { api, errorMessage, unwrap } from "@/api/client";
import { useVersions } from "@/api/hooks";
import type { EDL, EdlVersionOut, Thumbnails } from "@/api/types";
import { useEditor } from "@/lib/editorStore";
import { clock } from "@/lib/format";
import { usePlayer } from "@/lib/playerStore";
import { srcToOut } from "@/lib/timemap";
import { tileStyle } from "../timeline/Timeline";

/** Open/closed state per card, kept outside the components so polling re-renders can't reset it. */
const useCardState = create<{ open: Record<string, boolean>; set: (key: string, open: boolean) => void }>((set) => ({
  open: {},
  set: (key, open) => set((s) => ({ open: { ...s.open, [key]: open } })),
}));

export interface Short {
  id: string;
  title: string;
  latest: EdlVersionOut; // newest version of this short
  versions: EdlVersionOut[];
}

/** Plan versions grouped into shorts, newest short first. Refetches when the current version changes. */
export function useShorts(projectId: string, currentVersion: number) {
  const q = useVersions(projectId, currentVersion > 0);
  const { refetch } = q;
  useEffect(() => {
    if (currentVersion > 0) void refetch();
  }, [currentVersion, refetch]);
  const shorts = useMemo(() => {
    const byId = new Map<string, Short>();
    for (const v of q.data ?? []) {
      // Versions arrive newest first, so the first seen is the latest.
      const s = byId.get(v.short_id);
      if (s) s.versions.push(v);
      else byId.set(v.short_id, { id: v.short_id, title: v.short_title, latest: v, versions: [v] });
    }
    return [...byId.values()];
  }, [q.data]);
  const byVersion = useMemo(() => new Map((q.data ?? []).map((v) => [v.version, v])), [q.data]);
  const current = byVersion.get(currentVersion);
  // The plan loaded in the editor decides which video is "Editing", so a switch shows at once (before autosave).
  // Select the id (a string), not the tag object: a new object each render would loop forever.
  const loadedId = useEditor((s) => shortOf(s.byId[projectId]?.edl ?? null)?.id ?? null);
  return { shorts, byVersion, currentShortId: loadedId ?? current?.short_id ?? null, isLoading: q.isLoading };
}

/** The generated-video tag a plan carries (edl.meta.short), if any. */
function shortOf(edl: EDL | null): { id: string; title: string } | null {
  const tag = (edl?.meta as { short?: { id?: unknown; title?: unknown } } | undefined)?.short;
  return tag && typeof tag.id === "string" ? { id: tag.id, title: String(tag.title ?? "") } : null;
}

/** Jump the player to a source moment of the plan being edited (output time when it is in the edit). */
function seekInEdit(projectId: string, src: number) {
  const edl = useEditor.getState().byId[projectId]?.edl;
  const t = edl ? srcToOut(edl, src) : null;
  if (t !== null) usePlayer.getState().seekOut(t);
  else usePlayer.getState().seekSource(src);
}

/** Make a version the plan being edited (autosave stores it as a new version). Stops playback first and lands
 * on `atSrc` (a clip's start) or the beginning, always inside the edit. */
export function useOpenVersion(projectId: string) {
  const { message } = App.useApp();
  const edit = useEditor((s) => s.edit);
  return async (version: number, short: { id: string; title: string }, atSrc?: number) => {
    const title = short.title;
    usePlayer.getState().stop();
    try {
      const out = await unwrap(
        api.GET("/api/projects/{project_id}/edl/versions/{version}", {
          params: { path: { project_id: projectId, version } },
        }),
      );
      const opened = out.edl as EDL;
      const t = atSrc !== undefined ? srcToOut(opened, atSrc) : null;
      // Already editing this video (a second click, or a click that raced the first): just move the playhead.
      // Replacing the plan again would save a needless version.
      if (shortOf(useEditor.getState().byId[projectId]?.edl ?? null)?.id === short.id) {
        if (atSrc !== undefined) seekInEdit(projectId, atSrc);
        else usePlayer.getState().seekOut(0);
        return;
      }
      // Plans made before videos were tagged carry no meta.short. Stamp it, so the edits saved from here on
      // belong to this video instead of being grouped under whichever video was open before.
      const edl = shortOf(opened)
        ? opened
        : ({ ...opened, meta: { ...(opened.meta ?? {}), short: { id: short.id, title: short.title } } } as EDL);
      edit(projectId, () => edl);
      usePlayer.getState().seekOut(t ?? 0);
      message.success(`Editing "${title}"`);
    } catch (e) {
      message.error(errorMessage(e));
    }
  };
}

function ClipRows({ version, onPick }: { version: EdlVersionOut; onPick: (src: number) => void }) {
  const { token } = theme.useToken();
  return (
    <Flex vertical gap={2}>
      {version.segments.map((s, i) => (
        <Flex
          key={s.id}
          align="center"
          gap={10}
          role="button"
          tabIndex={0}
          onClick={(e) => {
            e.stopPropagation();
            onPick(s.src_start);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              e.stopPropagation();
              onPick(s.src_start);
            }
          }}
          style={{ padding: "3px 6px", borderRadius: token.borderRadiusSM, cursor: "pointer" }}
          aria-label={`Clip ${i + 1}, ${clock(s.src_start)} to ${clock(s.src_end)}`}
        >
          <Tag style={{ marginInlineEnd: 0, minWidth: 28, textAlign: "center" }}>{i + 1}</Tag>
          <Typography.Text style={{ fontVariantNumeric: "tabular-nums" }}>
            {clock(s.src_start)} – {clock(s.src_end)}
          </Typography.Text>
          <Typography.Text type="secondary" style={{ fontSize: token.fontSizeSM }}>
            {(s.src_end - s.src_start).toFixed(1)} s
          </Typography.Text>
        </Flex>
      ))}
    </Flex>
  );
}

function shortLabel(v: EdlVersionOut): string {
  return `${Math.round(v.output_duration_s)} s · ${v.aspect} · ${v.segment_count} clip${v.segment_count === 1 ? "" : "s"}`;
}

/** One short as a Think block (chat plan replies): icon, title, summary, clips as children. */
export function ShortThink({
  projectId,
  version,
  title,
  isCurrent,
  openVersion,
  defaultExpanded = false,
  note,
  cardKey,
}: {
  projectId: string;
  version: EdlVersionOut;
  title: string;
  isCurrent: boolean;
  openVersion?: number; // version to open (the short's latest); omitted hides the button
  defaultExpanded?: boolean;
  note?: React.ReactNode;
  cardKey: string; // stable id for remembering whether this card is open
}) {
  const { token } = theme.useToken();
  const open = useOpenVersion(projectId);
  const expanded = useCardState((s) => s.open[cardKey]) ?? defaultExpanded;
  const setExpanded = useCardState((s) => s.set);
  const tag = { id: version.short_id, title };
  const pick = (src: number) =>
    isCurrent || openVersion === undefined ? seekInEdit(projectId, src) : open(openVersion, tag, src);
  return (
    <Think
      icon={<VideoCameraAddOutlined style={{ color: token.colorSuccess }} />}
      title={
        <Flex align="center" gap={8} wrap style={{ minWidth: 0 }}>
          <Typography.Text strong ellipsis style={{ maxWidth: 260 }}>
            {title}
          </Typography.Text>
          <Typography.Text type="secondary" style={{ fontSize: token.fontSizeSM }}>
            {shortLabel(version)}
          </Typography.Text>
          {isCurrent ? (
            <Tag color="success" icon={<CheckCircleFilled />} style={{ marginInlineEnd: 0 }}>
              Editing
            </Tag>
          ) : null}
        </Flex>
      }
      expanded={expanded}
      onExpand={(v) => setExpanded(cardKey, v)}
    >
      {/* Ant Design X 2.9 marks closed content with a class it never styles, so render nothing when closed. */}
      {expanded ? (
        <Flex vertical gap={8}>
          {note}
          <ClipRows version={version} onPick={pick} />
          {!isCurrent && openVersion !== undefined ? (
            <div>
              <Button size="small" type="primary" ghost onClick={() => open(openVersion, tag)}>
                Edit this video
              </Button>
            </div>
          ) : null}
        </Flex>
      ) : null}
    </Think>
  );
}

function Thumb({ thumbnails, at }: { thumbnails: Thumbnails | null | undefined; at: number }) {
  const { token } = theme.useToken();
  const H = 44;
  const box: React.CSSProperties = {
    width: 78,
    height: H,
    borderRadius: token.borderRadiusSM,
    overflow: "hidden",
    flexShrink: 0,
    background: token.colorFillTertiary,
  };
  const ts = thumbnails ? tileStyle(thumbnails, at) : null;
  if (!thumbnails || !ts) {
    return (
      <Flex align="center" justify="center" style={box}>
        <VideoCameraAddOutlined style={{ color: token.colorTextTertiary }} />
      </Flex>
    );
  }
  const scale = H / thumbnails.tile_height;
  return (
    <div style={box}>
      <div
        style={{
          ...ts,
          width: thumbnails.tile_width,
          height: thumbnails.tile_height,
          transform: `scale(${scale})`,
          transformOrigin: "top left",
        }}
      />
    </div>
  );
}

function VideoCard({
  projectId,
  short,
  isCurrent,
  thumbnails,
}: {
  projectId: string;
  short: Short;
  isCurrent: boolean;
  thumbnails: Thumbnails | null | undefined;
}) {
  const { token } = theme.useToken();
  const open = useOpenVersion(projectId);
  const key = `tab:${projectId}:${short.id}`;
  const expanded = useCardState((s) => s.open[key]) ?? isCurrent;
  const setExpanded = useCardState((s) => s.set);
  const v = short.latest;
  const switchTo = (src?: number) => open(v.version, { id: short.id, title: short.title }, src);
  const pick = (src: number) => (isCurrent ? seekInEdit(projectId, src) : switchTo(src));
  const edits = short.versions.length - 1;
  return (
    <div
      role={isCurrent ? undefined : "button"}
      tabIndex={isCurrent ? undefined : 0}
      aria-label={isCurrent ? undefined : `Edit ${short.title}`}
      onClick={isCurrent ? undefined : () => switchTo()}
      onKeyDown={isCurrent ? undefined : (e) => (e.key === "Enter" ? switchTo() : undefined)}
      style={{
        padding: 10,
        borderRadius: token.borderRadiusLG,
        border: `1px solid ${isCurrent ? token.colorPrimary : token.colorBorderSecondary}`,
        background: isCurrent ? token.colorPrimaryBg : token.colorFillQuaternary,
        cursor: isCurrent ? "default" : "pointer",
      }}
    >
      <Flex align="center" gap={12}>
        <Thumb thumbnails={thumbnails} at={v.segments[0]?.src_start ?? 0} />
        <Flex vertical gap={2} style={{ minWidth: 0, flex: 1 }}>
          <Typography.Text strong ellipsis={{ tooltip: short.title }}>
            {short.title}
          </Typography.Text>
          <Typography.Text type="secondary" style={{ fontSize: token.fontSizeSM }}>
            {shortLabel(v)}
            {edits > 0 ? ` · ${edits} edit${edits === 1 ? "" : "s"}` : ""}
          </Typography.Text>
        </Flex>
        {isCurrent ? (
          <Tag color="success" icon={<CheckCircleFilled />} style={{ marginInlineEnd: 0 }}>
            Editing
          </Tag>
        ) : (
          <Button
            size="small"
            type="primary"
            icon={<EditOutlined />}
            onClick={(e) => {
              e.stopPropagation();
              void switchTo();
            }}
          >
            Edit this video
          </Button>
        )}
      </Flex>
      <Button
        type="text"
        size="small"
        icon={expanded ? <DownOutlined /> : <RightOutlined />}
        onClick={(e) => {
          e.stopPropagation();
          setExpanded(key, !expanded);
        }}
        style={{ marginTop: 6, paddingInline: 4, color: token.colorTextSecondary }}
      >
        Clips
      </Button>
      {expanded ? (
        <div style={{ marginTop: 4 }}>
          <ClipRows version={v} onPick={pick} />
        </div>
      ) : null}
    </div>
  );
}

/** The "Edited videos" tab: every generated short; the one being edited first. Click any card to edit it. */
export function GeneratedVideosPanel({
  projectId,
  currentVersion,
  thumbnails,
}: {
  projectId: string;
  currentVersion: number;
  thumbnails?: Thumbnails | null;
}) {
  const { token } = theme.useToken();
  const { shorts, currentShortId, isLoading } = useShorts(projectId, currentVersion);
  if (isLoading && currentVersion > 0) {
    return (
      <Flex justify="center" style={{ padding: 24 }}>
        <Spin />
      </Flex>
    );
  }
  if (!shorts.length) {
    return (
      <Empty
        style={{ marginTop: 48 }}
        description="No edited videos yet. Pick an idea or ask in the chat, and each video Clipora makes appears here."
      />
    );
  }
  // Keep the order fixed (newest first): moving the current card to the top slid another card under the pointer,
  // so the next click opened the video the user had just left.
  return (
    <Flex vertical gap={token.paddingXS} style={{ height: "100%", overflow: "auto", padding: "4px 12px 12px" }}>
      {shorts.map((s) => (
        <VideoCard key={s.id} projectId={projectId} short={s} isCurrent={s.id === currentShortId} thumbnails={thumbnails} />
      ))}
    </Flex>
  );
}
