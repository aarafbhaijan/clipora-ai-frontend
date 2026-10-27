// Streaming chat client for POST /api/chat/projects/{id}/messages (Server-Sent Events from the chat service).
// EventSource can't POST or send the auth header, so the body is read with fetch + a stream reader.
import type { JobOut, MessageOut } from "./types";
import { getToken } from "@/lib/auth";

export type ChatIntent = "edit" | "question" | "chat" | "speaker" | "transcript" | "unknown";

export interface ChatStreamHandlers {
  /** The message was routed and saved. `job` is set when it became an edit job. */
  onRoute?: (intent: ChatIntent, message: MessageOut, job?: JobOut) => void;
  /** A piece of the streamed answer. */
  onToken?: (text: string) => void;
  /** The saved assistant message (citation markers removed, sources in payload). */
  onDone?: (message: MessageOut) => void;
  /** The answer failed; a short assistant message explaining it was saved. */
  onError?: (code: string, message?: MessageOut) => void;
}

export class ChatHttpError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

function parseEvent(block: string): { event: string; data: unknown } | null {
  let event = "message";
  const data: string[] = [];
  for (const line of block.split("\n")) {
    if (line.startsWith(":")) continue; // keep-alive ping
    if (line.startsWith("event:")) event = line.slice(6).trim();
    else if (line.startsWith("data:")) data.push(line.slice(5).trimStart());
  }
  if (!data.length) return null;
  try {
    return { event, data: JSON.parse(data.join("\n")) };
  } catch {
    return null;
  }
}

/** Send a typed message and stream the reply. Resolves when the stream ends; rejects on HTTP errors. */
export async function streamChat(
  projectId: string,
  content: string,
  handlers: ChatStreamHandlers,
  signal?: AbortSignal,
): Promise<void> {
  const token = getToken();
  const res = await fetch(`/api/chat/projects/${projectId}/messages`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "text/event-stream",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ content }),
    signal,
  });
  if (!res.ok || !res.body) {
    let code = "bad_request";
    let message = "Something went wrong. Please try again.";
    try {
      const body = (await res.json()) as { error?: { code?: string; message?: string } };
      code = body.error?.code ?? code;
      message = body.error?.message ?? message;
    } catch {
      // not JSON: keep the generic message
    }
    throw new ChatHttpError(res.status, code, message);
  }

  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += value;
    let cut = buffer.indexOf("\n\n");
    while (cut !== -1) {
      const parsed = parseEvent(buffer.slice(0, cut));
      buffer = buffer.slice(cut + 2);
      cut = buffer.indexOf("\n\n");
      if (!parsed) continue;
      const d = parsed.data as Record<string, unknown>;
      if (parsed.event === "route") handlers.onRoute?.(d.intent as ChatIntent, d.message as MessageOut, d.job as JobOut | undefined);
      else if (parsed.event === "token") handlers.onToken?.(String(d.text ?? ""));
      else if (parsed.event === "done") handlers.onDone?.(d.message as MessageOut);
      else if (parsed.event === "error") handlers.onError?.(String(d.code ?? "internal"), d.message as MessageOut | undefined);
    }
  }
}

/** Tidy citations while the answer is still streaming, as the server does when it saves the answer:
 * a copied transcript label "[c12 01:02.40-01:05.10]" becomes "1:02–1:05", and [c12] / (c12) markers are hidden
 * (they become Sources when the answer is done). */
export function hideCitationMarkers(text: string): string {
  return text
    .replace(/[[(]c\d+\s+(\d+):(\d+)(?:\.\d+)?-(\d+):(\d+)(?:\.\d+)?[\])]/g, (_m, a, b, c, d) => `${Number(a)}:${b}–${Number(c)}:${d}`)
    .replace(/\s*[[(]c\d+[\])](?:\s*(?:,|and|,\s*and)?\s*[[(]c\d+[\])])*/g, "");
}
