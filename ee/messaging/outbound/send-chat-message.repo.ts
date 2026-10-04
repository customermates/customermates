import type {
  MessagingAttendee,
  MessagingMessage,
  MessagingThread,
  IngestMessage,
  AttachmentMeta,
} from "../messaging.schema";
import type { DraftThreadTarget } from "../draft-thread";

export abstract class SendChatMessageRepo {
  abstract findThreadByIdOrThrow(threadId: string): Promise<MessagingThread>;
  abstract findSelfAttendeeForThread(threadId: string): Promise<MessagingAttendee | null>;
  abstract findDraftById(args: { messageId: string }): Promise<DraftThreadTarget | null>;
  abstract restoreDraftSummaryIfPresent(args: { messageId: string }): Promise<void>;
  abstract findRecentOutboundDuplicate(args: {
    messagingThreadId: string;
    bodyText: string;
    windowMs: number;
  }): Promise<string | null>;
  abstract persistOutboundMessageOrThrow(args: {
    connectedAccountId: string;
    message: IngestMessage;
  }): Promise<MessagingMessage>;
  abstract convertDraftToSent(args: {
    messageId: string;
    expectedUpdatedAt: Date;
    unipileMessageId: string;
    providerMessageId: string | null;
    sender: MessagingAttendee;
    recipients: { to: MessagingAttendee[]; cc: MessagingAttendee[]; bcc: MessagingAttendee[] };
    subject: string | null;
    bodyText: string | null;
    bodyHtml: string | null;
    attachmentsMeta: AttachmentMeta[];
    sentAt: Date;
  }): Promise<MessagingMessage | null>;
}
