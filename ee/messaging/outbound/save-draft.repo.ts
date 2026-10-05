import type { MessagingAttendee, MessagingMessage, MessagingThread } from "../messaging.schema";
import type { MessagingProvider } from "@/generated/prisma";

export abstract class SaveDraftRepo {
  abstract findThreadByIdOrThrow(threadId: string): Promise<MessagingThread>;
  abstract findOrCreateDraftThread(args: {
    connectedAccountId: string;
    provider: MessagingProvider;
    recipients: string[];
    cc?: string[];
    bcc?: string[];
  }): Promise<MessagingThread>;
  abstract findSelfAttendeeForThread(threadId: string): Promise<MessagingAttendee | null>;
  abstract upsertThreadDraftOrThrow(args: {
    threadId: string;
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
  }): Promise<MessagingMessage>;
}
