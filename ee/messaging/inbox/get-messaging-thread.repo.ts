import type { MessagingMessage, MessagingThread } from "../messaging.schema";

export abstract class GetMessagingThreadRepo {
  abstract findThreadById(id: string): Promise<MessagingThread | null>;
  abstract listMessagesForThread(
    threadId: string,
    opts?: { page?: number; pageSize?: number },
  ): Promise<{ messages: MessagingMessage[]; total: number }>;
  abstract listThreadFolderPlacements(threadId: string): Promise<{ folderIds: string[]; sentAt: Date }[]>;
}
