import type { MessagingMessageDto } from "@/ee/messaging/inbox/inbox.schema";

import { htmlToPlainText } from "@/ee/messaging/email-body-text";
import { isEmailProvider } from "@/ee/messaging/provider";
import { isUnipileUnsupportedBody } from "@/ee/messaging/thread-display";

type MessagePreview = Pick<MessagingMessageDto, "provider" | "bodyText" | "bodyHtml" | "subject" | "isDeleted">;

export function messagePreview(message: MessagePreview): string | null {
  if (message.isDeleted) return null;

  const body = message.bodyText?.trim() || htmlToPlainText(message.bodyHtml);
  const preview = body || (isEmailProvider(message.provider) ? message.subject?.trim() : null);

  return preview && !isUnipileUnsupportedBody(preview) ? preview.replace(/\s+/g, " ").trim() || null : null;
}
