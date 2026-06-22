import type { IngestMessage, MessagingMessage, MessagingThread } from "../messaging.schema";
import type { MessagingThreadType } from "@/generated/prisma";

export abstract class MessagingIngestRepo {
  abstract ingestMessage(args: {
    companyId: string;
    connectedAccountId: string;
    message: IngestMessage;
    backfill?: boolean;
  }): Promise<
    { isEcho: true } | { isEcho: false; message: MessagingMessage; contactId: string | null; isNew: boolean }
  >;
  abstract countMessagesUnscoped(connectedAccountId: string): Promise<number>;
  abstract upsertChatThread(
    args: Pick<MessagingThread, "connectedAccountId" | "unipileThreadId" | "provider" | "subject" | "participants"> & {
      companyId: string;
      type?: MessagingThreadType;
      name?: string | null;
    },
  ): Promise<void>;
}
