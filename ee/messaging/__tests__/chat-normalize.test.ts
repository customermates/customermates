import { describe, expect, it } from "vitest";

import { MessagingProvider } from "@/generated/prisma";

import { normalizeChatMessage, parseUnipileTimestamp } from "../chat-normalize";
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
  it("captures the inmail subject from message specifics", () => {
    const msg = normalizeChatMessage(
      v2Message({ specifics: { subject: "New business opportunity" } }),
      MessagingProvider.linkedin,
    );

    expect(msg?.subject).toBe("New business opportunity");
  });

  it("leaves the subject null when specifics carry none", () => {
    const msg = normalizeChatMessage(v2Message(), MessagingProvider.linkedin);

    expect(msg?.subject).toBeNull();
  });
});

describe("parseUnipileTimestamp", () => {
  it.each([
    ["an ISO string", "2025-10-30T19:52:32.000Z"],
    ["epoch seconds", "1761853952"],
    ["epoch milliseconds", "1761853952000"],
  ])("reads %s", (_label, value) => {
    expect(parseUnipileTimestamp(value)).toEqual(new Date("2025-10-30T19:52:32.000Z"));
  });

  it.each([null, undefined, "", "not a date"])("returns null for %j", (value) => {
    expect(parseUnipileTimestamp(value)).toBeNull();
  });

  it("keeps a chat message whose timestamp is epoch seconds", () => {
    const msg = normalizeChatMessage(v2Message({ timestamp: "1761853952" }), MessagingProvider.telegram);

    expect(msg?.sentAt).toEqual(new Date("2025-10-30T19:52:32.000Z"));
  });
});
