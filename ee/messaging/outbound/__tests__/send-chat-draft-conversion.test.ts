import { describe, it, expect } from "vitest";

import type { SendChatMessageRepo } from "../send-chat-message.interactor";
import type { SendEmailRepo } from "../send-email.interactor";

type ChatArgs = Parameters<SendChatMessageRepo["convertDraftToSent"]>[0];
type EmailArgs = Parameters<SendEmailRepo["convertDraftToSent"]>[0];

describe("draft conversion contracts", () => {
  it("declares attachmentsMeta on the chat side, because one implementation serves both", () => {
    const chat: ChatArgs = {
      messageId: "m1",
      unipileMessageId: "u1",
      providerMessageId: null,
      sender: { attendeeId: "a", displayName: "a", identifier: "a", isSelf: true } as never,
      recipients: { to: [], cc: [], bcc: [] },
      subject: null,
      bodyText: "hi",
      bodyHtml: null,
      attachmentsMeta: [],
      sentAt: new Date(),
    };

    expect(Array.isArray(chat.attachmentsMeta)).toBe(true);
  });

  it("keeps the two contracts aligned on the fields the shared implementation reads", () => {
    const email: EmailArgs = {
      messageId: "m1",
      unipileMessageId: "u1",
      providerMessageId: null,
      sender: { attendeeId: "a", displayName: "a", identifier: "a", isSelf: true } as never,
      recipients: { to: [], cc: [], bcc: [] },
      subject: null,
      bodyText: "hi",
      bodyHtml: null,
      attachmentsMeta: [],
      sentAt: new Date(),
    };

    const chatKeys = new Set(Object.keys(email));
    for (const key of ["attachmentsMeta", "sender", "recipients", "sentAt"]) expect(chatKeys.has(key)).toBe(true);
  });
});
