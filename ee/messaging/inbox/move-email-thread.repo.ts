import type { MessagingProvider } from "@/generated/prisma";

export type MoveThread = {
  id: string;
  connectedAccountId: string;
  provider: MessagingProvider;
  companyId: string;
  unipileAccountId: string;
};

export type MovableMessage = {
  id: string;
  unipileMessageId: string;
  folderIds: string[];
};

export abstract class MoveEmailThreadRepo {
  abstract findThreadForMoveOrThrow(threadId: string): Promise<MoveThread>;
  abstract listThreadMovableMessages(threadId: string): Promise<MovableMessage[]>;
  abstract moveEmailMessageUnscoped(args: {
    companyId: string;
    connectedAccountId: string;
    unipileMessageId: string;
    newUnipileMessageId: string;
    folderIds: string[];
  }): Promise<{ id: string } | null>;
}
