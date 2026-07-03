import type { IngestMessage, MessageReactionEntry, MessagingMessage, MessagingThread } from "../messaging.schema";
import type { MessagingThreadType } from "@/generated/prisma";

export abstract class MessagingIngestRepo {
  abstract ingestMessageUnscoped(args: {
    companyId: string;
    connectedAccountId: string;
    message: IngestMessage;
    backfill?: boolean;
  }): Promise<
    { isEcho: true } | { isEcho: false; message: MessagingMessage; contactId: string | null; isNew: boolean }
  >;
  abstract upsertChatThreadUnscoped(
    args: Pick<MessagingThread, "connectedAccountId" | "unipileThreadId" | "provider" | "subject" | "participants"> & {
      companyId: string;
      type?: MessagingThreadType;
      name?: string | null;
      unipileThreadAltId?: string | null;
      lastMessageAt?: Date | null;
      lastMessagePreview?: string | null;
      lastMessageIsSender?: boolean | null;
    },
  ): Promise<{ id: string }>;
  abstract findThreadBackfillStateUnscoped(args: {
    connectedAccountId: string;
    unipileThreadId: string;
  }): Promise<{ lastMessageAt: Date | null; hasMessages: boolean } | null>;
  abstract updateMessageReactionsUnscoped(args: {
    companyId: string;
    connectedAccountId: string;
    unipileMessageId: string;
    reactions: MessageReactionEntry[];
  }): Promise<{ messagingThreadId: string } | null>;
  abstract deleteMessageUnscoped(args: {
    companyId: string;
    connectedAccountId: string;
    unipileMessageId: string;
  }): Promise<void>;
  abstract markMessageDeletedUnscoped(args: {
    companyId: string;
    connectedAccountId: string;
    unipileMessageId: string;
  }): Promise<{ messagingThreadId: string } | null>;
  abstract updateChatThreadMetadataUnscoped(args: {
    companyId: string;
    connectedAccountId: string;
    unipileThreadId: string;
    name?: string | null;
    subject?: string | null;
    type?: MessagingThreadType;
  }): Promise<void>;
  abstract deleteChatThreadUnscoped(args: {
    companyId: string;
    connectedAccountId: string;
    unipileThreadId: string;
  }): Promise<void>;
}
