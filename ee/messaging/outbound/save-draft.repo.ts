import type { MessagingAttendee, MessagingMessage, MessagingThread } from "../messaging.schema";
import type { MessagingProvider } from "@/generated/prisma";

type DraftContent = {
  connectedAccountId: string;
  provider: MessagingProvider;
  sender: MessagingAttendee;
  subject: string | null;
  bodyText: string;
  bodyHtml?: string | null;
  recipients: {
    to: MessagingAttendee[];
    cc: MessagingAttendee[];
    bcc: MessagingAttendee[];
  };
};

export abstract class SaveDraftRepo {
  abstract findThreadByIdOrThrow(threadId: string): Promise<MessagingThread>;
  abstract findSelfAttendeeForThread(threadId: string): Promise<MessagingAttendee | null>;
  abstract upsertThreadDraftOrThrow(args: DraftContent & { threadId: string }): Promise<MessagingMessage>;
  abstract createConversationDraftOrThrow(args: DraftContent): Promise<MessagingMessage>;
}
