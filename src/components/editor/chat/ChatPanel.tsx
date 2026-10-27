"use client";
// Chat with the editor agent (design.md "Chat"): ideas card, questions with tappable answers, plan
// replies with Undo and thumbs, answers with citations that seek the video, progress while it works.
import { RedoOutlined, UndoOutlined } from "@ant-design/icons";
import {
  Actions,
  Bubble,
  Prompts,
  Sender,
  Sources,
  Suggestion,
  Think,
  ThoughtChain,
  type BubbleItemType,
} from "@ant-design/x";
import { App, Button, Flex, Result, theme, Tooltip, Typography } from "antd";
import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { api, errorMessage, unwrap } from "@/api/client";
import { ChatHttpError, hideCitationMarkers, streamChat, type ChatIntent } from "@/api/chatStream";
import { keys, useMoreIdeas, useRetryJob, useSendMessage } from "@/api/hooks";
import type { EDL, MessageOut, ProjectDetail } from "@/api/types";
import { useEditor } from "@/lib/editorStore";
import { clock } from "@/lib/format";
import { readChoices, readChoiceSent, readSuggestionId, readCitations, readPreviousVersion, readSuggestions } from "@/lib/messages";
import { usePlayer } from "@/lib/playerStore";
import { STAGE_LABEL } from "@/lib/states";
import { srcToOut } from "@/lib/timemap";
import Markdown from "../../common/Markdown";
import Feedback from "./Feedback";
import { ShortThink, useShorts } from "./GeneratedVideos";
import IdeasCard from "./IdeasCard";

// Keys are the stage names the agent writes with ctx.progress (backend/packages/agent edit_graph.py).
const AGENT_STEPS: { key: string; title: string }[] = [
  { key: "understanding", title: "Understanding your request" },
  { key: "finding moments", title: "Finding the right moments" },
  { key: "building plan", title: "Building the plan" },
  { key: "framing the speaker", title: "Framing the speaker" },
  { key: "checking", title: "Checking the plan" },
  { key: "saving", title: "Saving" },
];
// Stages outside the planning path: shown as a single step.
const OTHER_STAGES: Record<string, string> = {
  "changing the plan": "Changing the plan",
  "searching the video": "Searching the video",
};

const SLASH = [
  { label: "/shorter · Make it shorter", value: "Make it shorter" },
  { label: "/longer · Make it a bit longer", value: "Make it a bit longer" },
  { label: "/square · Make it square (1:1)", value: "Make it square" },
  { label: "/vertical · Make it vertical (9:16)", value: "Make it vertical 9:16" },
  { label: "/fade-all · Fade between all clips", value: "Use a fade between all clips" },
  { label: "/cuts · Hard cuts only", value: "Use hard cuts between all clips" },
  { label: "/find · Where do I talk about…", value: "Where do I talk about " },
];

interface Props {
  project: ProjectDetail;
}

function AgentProgress({ stage, kind }: { stage: string | null; kind: string }) {
  if (kind === "suggest") return <Think title="Finding ideas in your video" loading blink />;
  if (stage && OTHER_STAGES[stage]) {
    return (
      <Think title="Working on it" loading defaultExpanded blink>
        <ThoughtChain items={[{ key: stage, title: OTHER_STAGES[stage], status: "loading" }]} line="dashed" />
      </Think>
    );
  }
  const idx = Math.max(0, AGENT_STEPS.findIndex((s) => s.key === stage));
  const items = AGENT_STEPS.slice(0, idx + 1).map((s, i) => ({
    key: s.key,
    title: s.title,
    status: (i < idx ? "success" : "loading") as "success" | "loading",
  }));
  return (
    <Think title="Working on it" loading defaultExpanded blink>
      <ThoughtChain items={items} line="dashed" />
    </Think>
  );
}

export default function ChatPanel({ project }: Props) {
  const { token } = theme.useToken();
  const { modal, message } = App.useApp();
  const send = useSendMessage(project.id);
  const moreIdeas = useMoreIdeas(project.id);
  const retry = useRetryJob(project.id);
  const editStore = useEditor((s) => s.edit);
  const seekOut = usePlayer((s) => s.seekOut);
  const seekSource = usePlayer((s) => s.seekSource);
  const [text, setText] = useState("");

  const job = project.active_job;
  const agentJob = job && (job.kind === "agent" || job.kind === "suggest") ? job : null;
  const busy = !!agentJob && (agentJob.status === "queued" || agentJob.status === "running");
  const waiting = agentJob?.status === "waiting_input";
  const ready = project.status === "ready";
  const hasPlan = project.current_version > 0;

  const submit = (body: { content?: string; suggestion_id?: string; choice?: string }) =>
    send.mutate(body, {
      onSuccess: () => setText(""),
      onError: (e) => message.error(errorMessage(e)),
    });

  // A typed message streams: the chat service routes it (edit / question / chat). Edits become a job as before;
  // questions and small talk stream their answer into a temporary bubble until the saved messages reload.
  const qc = useQueryClient();
  const [live, setLive] = useState<{ user: string; answer: string; intent?: ChatIntent } | null>(null);
  const streaming = live !== null;

  const sendTyped = async (content: string) => {
    setText("");
    setLive({ user: content, answer: "" });
    const reload = () => qc.invalidateQueries({ queryKey: keys.project(project.id) });
    try {
      await streamChat(project.id, content, {
        onRoute: (intent) => {
          setLive((l) => (l ? { ...l, intent } : l));
        },
        // "Who is speaking?" shows the YOLO boxes on the video (green = the speaker the crop follows), if any.
        onDone: (m) => {
          if ((m.payload as { show_speaker?: boolean } | null)?.show_speaker) usePlayer.getState().set({ showSpeaker: true });
        },
        onToken: (t) => setLive((l) => (l ? { ...l, answer: l.answer + t } : l)),
      });
    } catch (e) {
      message.error(e instanceof ChatHttpError ? e.message : errorMessage(e));
    } finally {
      await reload();
      qc.invalidateQueries({ queryKey: keys.projects });
      setLive(null);
    }
  };

  const pickIdea = (ideaId: string, title: string) => {
    if (!hasPlan) return submit({ suggestion_id: ideaId });
    modal.confirm({
      title: "Replace the current plan?",
      content: `Clipora will make a new plan for "${title}". You can go back from version history.`,
      okText: "Replace",
      onOk: () => submit({ suggestion_id: ideaId }),
    });
  };

  const undoTo = async (version: number) => {
    try {
      const out = await unwrap(
        api.GET("/api/projects/{project_id}/edl/versions/{version}", {
          params: { path: { project_id: project.id, version } },
        }),
      );
      editStore(project.id, () => out.edl as EDL);
      message.success("Restored the previous plan.");
    } catch (e) {
      message.error(errorMessage(e));
    }
  };

  const seekCitation = (start: number) => {
    const edl = useEditor.getState().byId[project.id]?.edl;
    const t = edl ? srcToOut(edl, start) : null;
    if (t !== null) seekOut(t);
    else seekSource(start);
  };

  const lastId = project.messages[project.messages.length - 1]?.id;
  const lastUserId = [...project.messages].reverse().find((m) => m.role === "user")?.id;
  const agentFailed = project.failed_job?.kind === "agent";

  /** Retry a prompt: re-run the failed request if it was the last one, else send the same prompt again. */
  const retryPrompt = (m: MessageOut) => {
    if (m.id === lastUserId && agentFailed && project.failed_job) {
      retry.mutate(project.failed_job.id, { onError: (e) => message.error(errorMessage(e)) });
      return;
    }
    const idea = readSuggestionId(m);
    const choice = readChoiceSent(m);
    if (idea) submit({ suggestion_id: idea });
    else if (choice) submit({ choice });
    else if (m.content.trim()) void sendTyped(m.content);
  };
  const { shorts, byVersion, currentShortId } = useShorts(project.id, project.current_version);

  const items: BubbleItemType[] = useMemo(() => {
    const claimed = new Set<number>();
    const out: BubbleItemType[] = project.messages.map((m: MessageOut) => {
      if (m.role === "user") {
        return {
          key: m.id,
          role: "user",
          content: m.content || readChoiceSent(m) || "",
          footer: (
            <Tooltip title={m.id === lastUserId && agentFailed ? "Try this request again" : "Send this again"}>
              <Button
                size="small"
                type="text"
                icon={<RedoOutlined />}
                aria-label="Retry this message"
                disabled={busy || streaming || !ready || send.isPending || retry.isPending}
                onClick={() => retryPrompt(m)}
              >
                Retry
              </Button>
            </Tooltip>
          ),
        };
      }
      if (m.kind === "suggestions") {
        return {
          key: m.id,
          role: "ideas",
          content: (
            <IdeasCard
              projectId={project.id}
              messageId={m.id}
              data={readSuggestions(m)}
              disabled={busy}
              onPick={pickIdea}
              onMore={() => moreIdeas.mutate(undefined, { onError: (e) => message.error(errorMessage(e)) })}
            />
          ),
        };
      }
      if (m.kind === "choices") {
        const choices = readChoices(m);
        const open = m.id === lastId && waiting;
        return {
          key: m.id,
          role: "ai",
          content: <Markdown content={m.content} />,
          footer: choices.length ? (
            <Prompts
              wrap
              items={choices.map((c) => ({ key: c, label: c, disabled: !open || send.isPending }))}
              onItemClick={({ data }) => submit({ choice: String(data.key) })}
            />
          ) : undefined,
        };
      }
      const citations = readCitations(m);
      const prev = readPreviousVersion(m);
      // A plan reply is the first assistant message pointing at a version the AI made (answers cite lines).
      const made = m.edl_version !== null ? byVersion.get(m.edl_version) : undefined;
      const firstForVersion = m.edl_version !== null && !claimed.has(m.edl_version);
      if (m.edl_version !== null) claimed.add(m.edl_version);
      const isPlan =
        m.edl_version !== null && !citations.length && (prev !== undefined || (made?.author === "agent" && firstForVersion));
      const snapshot = isPlan && m.edl_version !== null ? byVersion.get(m.edl_version) : undefined;
      const latest = snapshot ? shorts.find((s) => s.id === snapshot.short_id)?.latest : undefined;
      return {
        key: m.id,
        role: "ai",
        content: snapshot ? (
          <ShortThink
            cardKey={`chat:${m.id}`}
            projectId={project.id}
            version={snapshot}
            title={snapshot.short_title}
            isCurrent={snapshot.short_id === currentShortId}
            openVersion={latest?.version}
            defaultExpanded={m.id === lastId}
          />
        ) : (
          <Markdown content={m.content} />
        ),
        footer: (
          <Flex vertical gap={6}>
            {citations.length ? (
              <Sources
                title={`From the video (${citations.length})`}
                items={citations.map((c, i) => ({
                  key: `${c.cue_id || i}`,
                  title: `${clock(c.start_s)}${c.text ? ` · ${c.text}` : ""}`,
                  description: c.text,
                }))}
                onClick={(item) => {
                  const c = citations.find((x, i) => `${x.cue_id || i}` === String(item.key));
                  if (c) seekCitation(c.start_s);
                }}
              />
            ) : null}
            <Flex align="center" gap={8}>
              <Actions.Copy text={m.content} />
              {isPlan || citations.length ? (
                <Feedback projectId={project.id} kind={isPlan ? "plan" : "answer"} targetRef={isPlan ? String(m.edl_version) : m.id} />
              ) : null}
              {isPlan && prev ? (
                <Button size="small" type="text" icon={<UndoOutlined />} onClick={() => undoTo(prev)}>
                  Undo
                </Button>
              ) : null}
            </Flex>
          </Flex>
        ),
      };
    });
    if (live) {
      out.push({ key: "live-user", role: "user", content: live.user });
      if (live.intent !== "edit") {
        out.push({
          key: "live-answer",
          role: "ai",
          content: live.answer ? (
            <Markdown content={hideCitationMarkers(live.answer)} streaming />
          ) : (
            <Think title={live.intent ? "Writing…" : "Understanding your message…"} loading blink />
          ),
        });
      }
    }
    if (busy && agentJob) {
      out.push({ key: "working", role: "ai", content: <AgentProgress stage={agentJob.stage} kind={agentJob.kind} /> });
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    project.messages,
    busy,
    waiting,
    agentJob?.stage,
    send.isPending,
    hasPlan,
    byVersion,
    shorts,
    currentShortId,
    agentFailed,
    ready,
    retry.isPending,
    live,
  ]);

  if (project.status === "uploading" || project.status === "ingesting") {
    const stage = job?.stage ? STAGE_LABEL[job.stage] ?? "Working on it" : project.status === "uploading" ? "Uploading" : "Waiting to start";
    return (
      <Flex vertical align="center" justify="center" style={{ height: "100%", padding: 24 }} gap={12}>
        <Think title={`${stage}${job?.percent ? ` ${job.percent}%` : ""}`} loading blink />
        <Typography.Text type="secondary" style={{ textAlign: "center" }}>
          Preparing your video. You can open other videos meanwhile; ideas will be waiting here.
        </Typography.Text>
      </Flex>
    );
  }

  if (project.status === "failed" || (project.failed_job?.kind === "ingest" && !ready)) {
    const tooLong = project.failed_job?.error_code === "duration_too_long";
    return (
      <Result
        status="error"
        title={tooLong ? "This video is too long" : "We couldn't prepare this video"}
        subTitle={tooLong ? "It is longer than your limit. Delete it and upload a shorter one." : "Try again. If it keeps failing, upload the file again."}
        extra={
          !tooLong && project.failed_job ? (
            <Button type="primary" icon={<RedoOutlined />} loading={retry.isPending} onClick={() => retry.mutate(project.failed_job!.id)}>
              Retry
            </Button>
          ) : undefined
        }
      />
    );
  }

  return (
    <Flex vertical style={{ height: "100%", minHeight: 0 }}>
      <div style={{ flex: 1, minHeight: 0 }}>
        {items.length ? (
          <Bubble.List
            items={items}
            autoScroll
            style={{ height: "100%", paddingInline: 8 }}
            role={{
              ai: { placement: "start", variant: "outlined" },
              user: { placement: "end", variant: "filled" },
              ideas: { placement: "start", variant: "borderless", styles: { content: { width: "100%" } } },
            }}
          />
        ) : (
          <Flex vertical align="center" justify="center" style={{ height: "100%", padding: 24 }}>
            <Typography.Text type="secondary">Tell Clipora what you want, for example “make a 1-minute short about pricing”.</Typography.Text>
          </Flex>
        )}
      </div>
      {project.failed_job?.kind === "agent" && !busy ? (
        <Typography.Text type="danger" style={{ padding: "0 12px", fontSize: token.fontSizeSM }}>
          {project.failed_job.error_code === "rate_limited"
            ? "Clipora's AI has hit its usage limit for now, so the last request didn't run."
            : "The last request didn't finish."}{" "}
          <Typography.Link onClick={() => retry.mutate(project.failed_job!.id)}>Try again</Typography.Link>
        </Typography.Text>
      ) : null}
      <div style={{ padding: 8 }}>
        <Suggestion
          items={SLASH}
          onSelect={(v) => setText(v)}
        >
          {({ onTrigger, onKeyDown }) => (
            <Sender
              value={text}
              loading={busy || send.isPending || streaming}
              disabled={!ready}
              placeholder={waiting ? "Answer the question, or type anything" : "Or tell me what you want · type / for shortcuts"}
              onChange={(v) => {
                setText(v);
                onTrigger(v === "/" ? undefined : false);
              }}
              onKeyDown={(e) => {
                // Suggestion wraps the box in rc-select, whose key handler calls preventDefault on Space
                // (Space opens a select). Stop it here so typing a space works.
                if (e.key === " ") {
                  e.stopPropagation();
                  return;
                }
                return onKeyDown(e);
              }}
              onSubmit={(v) => v.trim() && !streaming && void sendTyped(v.trim())}
              autoSize={{ minRows: 1, maxRows: 5 }}
            />
          )}
        </Suggestion>
      </div>
    </Flex>
  );
}
