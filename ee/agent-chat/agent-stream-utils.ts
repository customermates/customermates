import type { ModelMessage } from "ai";
import type { AgentNativeFile } from "./agent-native-files";

import { clientSafeAgentMessageParts } from "./agent-chat.schema";

export type ReplayMessage = { role: string; text: string; attachedText?: string; files?: AgentNativeFile[] };

const encoder = new TextEncoder();

function toModelMessage(message: ReplayMessage): ModelMessage | null {
  const text = message.text.trim();
  if (!text) return null;
  if (message.role !== "user") return { role: "assistant", content: text };
  const files = (message.files ?? []).flatMap((file) =>
    file.data ? [{ type: "file" as const, data: file.data, mediaType: file.mediaType, filename: file.name }] : [],
  );
  if (!message.attachedText && !files.length) return { role: "user", content: text };
  return {
    role: "user",
    content: [
      { type: "text", text },
      ...(message.attachedText ? [{ type: "text" as const, text: message.attachedText }] : []),
      ...files,
    ],
  };
}

export function toModelMessages(messages: ReplayMessage[]): ModelMessage[] {
  const mapped = messages.flatMap((message) => {
    const mappedMessage = toModelMessage(message);
    return mappedMessage ? [mappedMessage] : [];
  });
  while (mapped.length && mapped[0].role === "assistant") mapped.shift();
  return mapped;
}

export function sse(seq: number, type: string, payload: Record<string, unknown> = {}, wikiBaseUrl?: string) {
  const safePayload =
    type === "message_replay"
      ? {
          ...(typeof payload.messageId === "string" ? { messageId: payload.messageId } : {}),
          parts: clientSafeAgentMessageParts(payload.parts, {
            sanitizeText: true,
            wikiBaseUrl,
          }),
          ...(typeof payload.createdAt === "string" ? { createdAt: payload.createdAt } : {}),
        }
      : payload;
  return encoder.encode(`id: ${seq}\ndata: ${JSON.stringify({ seq, type, ...safePayload })}\n\n`);
}
