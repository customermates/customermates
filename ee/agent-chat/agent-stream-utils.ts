import type { ModelMessage } from "ai";

import { clientSafeAgentMessageParts } from "./agent-chat.schema";

export type ReplayMessage = { role: string; text: string };

const encoder = new TextEncoder();

export function toModelMessages(messages: ReplayMessage[]): ModelMessage[] {
  const mapped = messages
    .map((message) => {
      const text = message.text.trim();
      return {
        role: message.role === "user" ? ("user" as const) : ("assistant" as const),
        content: text,
      };
    })
    .filter((message) => message.content);
  while (mapped.length && mapped[0].role === "assistant") mapped.shift();
  return mapped;
}

export function sse(seq: number, type: string, payload: Record<string, unknown> = {}) {
  const safePayload =
    type === "message_replay"
      ? {
          ...(typeof payload.messageId === "string" ? { messageId: payload.messageId } : {}),
          parts: clientSafeAgentMessageParts(payload.parts, { sanitizeText: true }),
          ...(typeof payload.createdAt === "string" ? { createdAt: payload.createdAt } : {}),
        }
      : payload;
  return encoder.encode(`id: ${seq}\ndata: ${JSON.stringify({ seq, type, ...safePayload })}\n\n`);
}
