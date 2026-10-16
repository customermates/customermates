import type { MessagingAttendee, MessagingMessage, MessagingThread, IngestMessage } from "../messaging.schema";
import type { DraftThreadTarget } from "../draft-thread";

export abstract class SendChatMessageRepo {
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
}
