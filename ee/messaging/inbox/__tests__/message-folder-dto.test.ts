import { describe, expect, it } from "vitest";

import { MessagingMessageSchema } from "../../messaging.schema";
import { MessagingMessageDtoSchema, toMessagingMessageDto } from "../inbox.schema";

const message = MessagingMessageSchema.parse({
  id: "00000000-0000-4000-8000-000000000001",
  messagingThreadId: "00000000-0000-4000-8000-000000000002",
  connectedAccountId: "00000000-0000-4000-8000-000000000003",
  unipileMessageId: "provider-email",
  provider: "mail",
  direction: "inbound",
  origin: "unipile",
  sender: { attendeeId: "sender", identifier: "sender@example.test", displayName: "Sender", isSelf: false },
  recipients: { to: [], cc: [], bcc: [] },
  subject: "Example",
  bodyText: "Example",
  bodyHtml: null,
  attachmentsMeta: [],
  folderIds: ["inbox", "work"],
  sentAt: new Date("2026-09-30T09:00:00Z"),
  editedAt: null,
  createdAt: new Date("2026-09-30T09:00:00Z"),
  updatedAt: new Date("2026-09-30T09:00:00Z"),
});

describe("message folder display DTO", () => {
  it("preserves each message's persisted placements through the inbox display boundary", () => {
    expect(toMessagingMessageDto(message).folderIds).toEqual(["inbox", "work"]);
    expect(toMessagingMessageDto({ ...message, folderIds: ["sent"] }).folderIds).toEqual(["sent"]);
  });

  it("still accepts older responses and pending messages without folder information", () => {
    const older = { ...toMessagingMessageDto(message) };
    delete older.folderIds;
    expect(MessagingMessageDtoSchema.safeParse(older).success).toBe(true);
  });
});
