import type { MessagingMessageDto } from "@/ee/messaging/inbox/inbox.schema";
import type { MessagingMessage } from "@/ee/messaging/messaging.schema";

import { MessagingMessageDirection, MessagingMessageOrigin, MessagingProvider } from "@/generated/prisma";

export const RECORDED_MESSAGE_ID = "00000000-0000-4000-8000-0000000000d1";
export const RECORDED_THREAD_ID = "00000000-0000-4000-8000-0000000000d2";
export const RECORDED_ACCOUNT_ID = "00000000-0000-4000-8000-0000000000d3";

export function recordedMessage(
  overrides: Partial<MessagingMessage> = {},
): MessagingMessage & Pick<MessagingMessageDto, "draftRevision"> {
  return {
    id: RECORDED_MESSAGE_ID,
    messagingThreadId: RECORDED_THREAD_ID,
    connectedAccountId: RECORDED_ACCOUNT_ID,
    unipileMessageId: "recorded-provider-message",
    providerMessageId: null,
    provider: MessagingProvider.whatsapp,
    direction: MessagingMessageDirection.outbound,
    origin: MessagingMessageOrigin.unipile,
    sender: { attendeeId: "", displayName: null, identifier: "", isSelf: true, records: [] },
    recipients: { to: [], cc: [], bcc: [] },
    subject: null,
    bodyText: "Recorded message",
    bodyHtml: null,
    attachmentsMeta: [],
    folderIds: [],
    isEvent: false,
    isDeleted: false,
    isHidden: false,
    isDraft: false,
    draftRevision: null,
    sentAt: new Date("2026-09-04T10:00:00.000Z"),
    editedAt: null,
    reactions: [],
    createdAt: new Date("2026-09-04T10:00:00.000Z"),
    updatedAt: new Date("2026-09-04T10:00:00.000Z"),
    ...overrides,
  };
}
