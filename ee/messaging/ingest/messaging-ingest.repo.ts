import type { IngestMessage, MessageReactionEntry, MessagingMessage, MessagingThread } from "../messaging.schema";
import type { MessagingThreadType } from "@/generated/prisma";

export abstract class MessagingIngestRepo {
  abstract ingestMessageUnscoped(args: {
    companyId: string;
    connectedAccountId: string;
    message: IngestMessage;
    backfill?: boolean;
  }): Promise<
    | { isEcho: true; isDuplicate?: false }
    | { isEcho: false; isDuplicate: true }
    | { isEcho: false; isDuplicate?: false; message: MessagingMessage }
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
  abstract findThreadLatestMessageAtUnscoped(args: {
    connectedAccountId: string;
    unipileThreadId: string;
  }): Promise<Date | null>;
  abstract updateMessageReactionsUnscoped(args: {
    companyId: string;
    connectedAccountId: string;
    unipileMessageId: string;
    reactions: MessageReactionEntry[];
  }): Promise<{ id: string; messagingThreadId: string } | null>;
  abstract findMessageByUnipileIdUnscoped(args: {
    connectedAccountId: string;
    unipileMessageId: string;
  }): Promise<MessagingMessage | null>;
  abstract moveEmailMessageUnscoped(args: {
    companyId: string;
    connectedAccountId: string;
    unipileMessageId: string;
    newUnipileMessageId: string;
    folderIds: string[];
  }): Promise<{ id: string } | null>;
  abstract deleteMessageUnscoped(args: {
    companyId: string;
    connectedAccountId: string;
    unipileMessageId: string;
  }): Promise<{ id: string; messagingThreadId: string } | null>;
  abstract markMessageDeletedUnscoped(args: {
    companyId: string;
    connectedAccountId: string;
    unipileMessageId: string;
  }): Promise<{ id: string; messagingThreadId: string } | null>;
  abstract updateChatThreadMetadataUnscoped(args: {
    companyId: string;
    connectedAccountId: string;
    unipileThreadId: string;
    name?: string | null;
    subject?: string | null;
    type?: MessagingThreadType;
  }): Promise<{ id: string } | null>;
  abstract deleteChatThreadUnscoped(args: {
    companyId: string;
    connectedAccountId: string;
    unipileThreadId: string;
  }): Promise<{ id: string } | null>;
  abstract reconcileFolderMembershipUnscoped(args: {
    companyId: string;
    connectedAccountId: string;
    folderId: string;
    since: Date;
    seenUnipileMessageIds: string[];
  }): Promise<number>;
}
