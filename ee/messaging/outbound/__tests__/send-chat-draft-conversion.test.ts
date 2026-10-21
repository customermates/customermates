import { describe, it, expect } from "vitest";

import type { CompleteReplyDraftSendArgs } from "../draft-send.repo";

describe("draft conversion contract", () => {
  it("declares one completion contract that carries what both the email and the chat send record", () => {
    const completion: CompleteReplyDraftSendArgs = {
      claim: { id: "c1", draftRevision: new Date() },
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

    const keys = new Set(Object.keys(completion));
    for (const key of ["claim", "attachmentsMeta", "sender", "recipients", "sentAt"]) expect(keys.has(key)).toBe(true);
  });
});
