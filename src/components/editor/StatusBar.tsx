"use client";
// Editor status bar, like VS Code's: one thin row at the bottom with what the agent is doing on the left and the
// plan's facts on the right. It turns blue while the agent works. Click the agent item to open the chat.
import {
  CheckOutlined,
  CloudSyncOutlined,
  ExportOutlined,
  LoadingOutlined,
  QuestionCircleOutlined,
  RobotOutlined,
  WarningOutlined,
} from "@ant-design/icons";
import { Flex, theme, Tooltip } from "antd";
import { useState } from "react";
import type { EDL, ProjectDetail } from "@/api/types";
import { agentStatus, AGENT_STEPS } from "@/lib/agent";
import { useProjectEdit } from "@/lib/editorStore";
import { clock } from "@/lib/format";
import { outputDuration } from "@/lib/timemap";
import { ideColors } from "@/theme";

export const STATUS_BAR_H = 22;

function Item({
  children,
  tip,
  onClick,
  strong,
}: {
  children: React.ReactNode;
  tip?: React.ReactNode;
  onClick?: () => void;
  strong?: boolean;
}) {
  const { token } = theme.useToken();
  const [hover, setHover] = useState(false);
  const body = (
    <Flex
      align="center"
      gap={5}
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      onClick={onClick}
      onKeyDown={(e) => (onClick && (e.key === "Enter" || e.key === " ") ? onClick() : undefined)}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        height: STATUS_BAR_H,
        padding: "0 8px",
        cursor: onClick ? "pointer" : "default",
        whiteSpace: "nowrap",
        fontWeight: strong ? 600 : undefined,
        background: onClick && hover ? token.colorFillSecondary : undefined,
      }}
    >
      {children}
    </Flex>
  );
  return tip ? <Tooltip title={tip}>{body}</Tooltip> : body;
}

function SaveItem({ projectId }: { projectId: string }) {
  const { dirty, saving, saveError } = useProjectEdit(projectId);
  if (saveError)
    return (
      <Item tip={saveError}>
        <WarningOutlined /> Not saved
      </Item>
    );
  if (saving || dirty)
    return (
      <Item tip="Your edits are being saved">
        <CloudSyncOutlined /> Saving
      </Item>
    );
  return (
    <Item tip="Every change is saved as a new version">
      <CheckOutlined /> Saved
    </Item>
  );
}

export default function StatusBar({ project, edl, onOpenChat }: { project: ProjectDetail; edl: EDL | null; onOpenChat: () => void }) {
  const { token } = theme.useToken();
  const agent = agentStatus(project);
  const busy = agent.mode === "working" || agent.mode === "preparing";
  const icon =
    busy ? <LoadingOutlined /> : agent.mode === "waiting" ? <QuestionCircleOutlined /> : agent.mode === "failed" ? <WarningOutlined /> : <RobotOutlined />;
  const pct = busy && agent.percent ? ` · ${Math.round(agent.percent)}%` : "";
  const step = agent.step ? ` (${agent.step}/${AGENT_STEPS.length})` : "";
  const out = edl?.output;

  return (
    <Flex
      align="center"
      justify="space-between"
      role="status"
      aria-label="Editor status"
      style={{
        height: STATUS_BAR_H,
        flexShrink: 0,
        fontSize: token.fontSizeSM,
        background: busy ? ideColors.statusBarBusy : ideColors.statusBar,
        color: busy ? ideColors.statusBarBusyText : ideColors.statusBarText,
        borderTop: `1px solid ${token.colorBorderSecondary}`,
        transition: `background ${token.motionDurationMid}`,
        overflow: "hidden",
      }}
    >
      <Flex align="center" style={{ minWidth: 0 }}>
        <Item strong onClick={onOpenChat} tip="Open the chat with the Clipora agent">
          <span style={{ color: busy ? undefined : ideColors.agent, display: "inline-flex" }}>{icon}</span>
          Clipora agent: {agent.label}
          {step}
          {pct}
        </Item>
        {project.current_version > 0 ? (
          <Item tip="The plan's version. Every change, yours or the agent's, makes a new one.">v{project.current_version}</Item>
        ) : null}
        {edl ? (
          <Item tip="Clips in the plan and the short's length">
            {edl.segments.length} {edl.segments.length === 1 ? "clip" : "clips"} · {clock(outputDuration(edl))}
          </Item>
        ) : null}
      </Flex>
      <Flex align="center">
        {out ? (
          <Item tip="Output shape and size">
            {out.aspect} · {out.width}×{out.height} · {out.framing === "fit" ? "Fit" : "Crop"}
          </Item>
        ) : null}
        {edl ? <SaveItem projectId={project.id} /> : null}
        {project.last_export ? (
          <Item tip="This video has been exported">
            <ExportOutlined /> Exported
          </Item>
        ) : null}
      </Flex>
    </Flex>
  );
}
