import type {
  MessagingAttendee,
  MessagingMessage,
  MessagingThread,
  IngestMessage,
  AttachmentMeta,
} from "../messaging.schema";
import type { DraftThreadTarget } from "../draft-thread";
import type { DraftSendClaim } from "../draft-send";

import { DraftSendRepo } from "./draft-send.repo";

export abstract class SendChatMessageRepo extends DraftSendRepo {
  abstract findThreadByIdOrThrow(threadId: string): Promise<MessagingThread>;
  abstract findThreadById(threadId: string): Promise<MessagingThread | null>;
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
  abstract completeReplyDraftSend(args: {
    claim: DraftSendClaim;
    messageId: string;
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
