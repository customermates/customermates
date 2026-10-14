import type { MessagingProvider } from "@/generated/prisma";

export abstract class GetMessageAttachmentMetaRepo {
  abstract findAttachmentForMessageOrThrow(args: { messageId: string; attachmentId: string }): Promise<{
    unipileAccountId: string;
    unipileThreadId: string;
    unipileMessageId: string;
    provider: MessagingProvider;
    mime: string | null;
    fileName: string | null;
    size: number | null;
  }>;
}
