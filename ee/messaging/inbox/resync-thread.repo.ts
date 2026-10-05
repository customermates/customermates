import type { IngestMessage, MessagingAttendee } from "../messaging.schema";
import type { MessagingProvider, MessagingThreadType } from "@/generated/prisma";

export type ResyncThread = {
  id: string;
  unipileThreadId: string;
  connectedAccountId: string;
  provider: MessagingProvider;
  type: MessagingThreadType;
  companyId: string;
  unipileAccountId: string;
  emailAddress: string | null;
  sentFolderIds: string[];
};

export abstract class ResyncThreadRepo {
  abstract findThreadForResyncOrThrow(threadId: string): Promise<ResyncThread>;
  abstract upsertThreadParticipantsUnscoped(args: {
    messagingThreadId: string;
    companyId: string;
    provider: MessagingProvider;
    participants: MessagingAttendee[];
  }): Promise<void>;
  abstract ingestMessageUnscoped(args: {
    companyId: string;
    connectedAccountId: string;
    message: IngestMessage;
    backfill?: boolean;
  }): Promise<unknown>;
  abstract recordUnusableItemUnscoped(args: {
    companyId: string;
    connectedAccountId: string;
    payload: unknown;
    unipileMessageId?: string | null;
  }): Promise<void>;
}
