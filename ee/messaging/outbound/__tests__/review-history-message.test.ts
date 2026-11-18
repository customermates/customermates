import type { MessagingMessage } from "../../messaging.schema";

import { describe, expect, it } from "vitest";

import { toReviewHistoryMessage } from "../list-review-drafts.interactor";

function message(overrides: Partial<MessagingMessage>): MessagingMessage {
  return {
    id: "6f1f4f0e-6f6b-4c57-9d6b-0d1d1f8f1a01",
    messagingThreadId: "6f1f4f0e-6f6b-4c57-9d6b-0d1d1f8f1a02",
    connectedAccountId: "6f1f4f0e-6f6b-4c57-9d6b-0d1d1f8f1a03",
    unipileMessageId: "provider-message",
    providerMessageId: null,
    provider: "mail",
    direction: "inbound",
    origin: "unipile",
    sender: { attendeeId: "person@example.test", identifier: "person@example.test", displayName: "Person" },
    recipients: { to: [], cc: [], bcc: [] },
    subject: "Rollout",
    bodyText: "The answer",
    bodyHtml: "<p>The answer</p>",
    attachmentsMeta: [],
    folderIds: [],
    isEvent: false,
    isDeleted: false,
    isHidden: false,
    isDraft: false,
    sentAt: new Date("2026-11-17T10:00:00.000Z"),
    editedAt: null,
    reactions: [],
    createdAt: new Date("2026-11-17T10:00:00.000Z"),
    updatedAt: new Date("2026-11-17T10:00:00.000Z"),
    ...overrides,
  } as MessagingMessage;
}

describe("earlier messages in the draft review", () => {
  it("keeps the whole written text and leaves out the quoted reply chain and the formatted copy", () => {
    const written = "Hi Ben,\n\ntwo things came up:\n\n1. Approval\n2. Import\n\nJulia";
    const result = toReviewHistoryMessage(
      message({
        bodyText: `${written}\n\nOn Monday Ben wrote:\n> the earlier message\n> over two lines`,
        bodyHtml: "<p>Hi Ben,</p><blockquote>the earlier message</blockquote>",
      }),
    );

    expect(result.bodyText).toBe(written);
    expect(result.bodyHtml).toBeNull();
    expect(result.subject).toBe("Rollout");
    expect(result.direction).toBe("inbound");
  });

  it("keeps a message without quoted text unchanged and one without text empty", () => {
    expect(toReviewHistoryMessage(message({ bodyText: "Short answer" })).bodyText).toBe("Short answer");
    expect(toReviewHistoryMessage(message({ bodyText: null })).bodyText).toBeNull();
  });
});
