import { describe, expect, it } from "vitest";

import { MessagingProvider } from "@/generated/prisma";

import { normalizeChatMessage } from "../chat-normalize";
import { UnipileMessageSchema } from "../unipile.schema";

function v2Message(over: Record<string, unknown> = {}) {
  return UnipileMessageSchema.parse({
    object: "Message",
    id: "m1",
    chat_id: "c1@s.whatsapp.net",
    timestamp: "2026-06-01T00:00:00Z",
    text: "hello",
    is_sender: false,
    sender: { id: "u1", display_name: "Sender" },
    ...over,
  });
}

describe("normalizeChatMessage", () => {
  it("sets editedAt from the event timestamp when the message is edited", () => {
    const msg = normalizeChatMessage(v2Message({ is_edited: true, text: "edited body" }), MessagingProvider.whatsapp);

    expect(msg?.editedAt).toEqual(new Date("2026-06-01T00:00:00Z"));
    expect(msg?.bodyText).toBe("edited body");
  });

  it("leaves editedAt null when the message is not edited", () => {
    const msg = normalizeChatMessage(v2Message(), MessagingProvider.whatsapp);

    expect(msg?.editedAt).toBeNull();
  });
});
