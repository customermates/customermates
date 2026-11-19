import type { MessagingMessageDto } from "@/ee/messaging/inbox/inbox.schema";
import type { SendAttachment } from "@/ee/messaging/outbound/send-email.interactor";

import { isEmailProvider } from "@/ee/messaging/provider";

import { sendChatMessageAction, sendEmailAction, startChatAction } from "../actions";

type SavedDraft = MessagingMessageDto & { draftRevision: string };

export function isSendableDraft(draft: MessagingMessageDto): draft is SavedDraft {
  return draft.isDraft && Boolean(draft.draftRevision);
}

export function sendSavedDraft(
  draft: SavedDraft,
  options: { newThread: boolean; recipients: string[]; attachments?: SendAttachment[] },
) {
  const draftBinding = { draftMessageId: draft.id, draftRevision: draft.draftRevision };
  const { attachments, recipients } = options;

  if (isEmailProvider(draft.provider)) {
    return sendEmailAction({
      ...(options.newThread ? { connectedAccountId: draft.connectedAccountId } : { threadId: draft.messagingThreadId }),
      to: recipients.map((identifier) => ({ identifier })),
      cc: draft.recipients.cc.length ? draft.recipients.cc.map((recipient) => recipient.identifier) : undefined,
      bcc: draft.recipients.bcc.length ? draft.recipients.bcc.map((recipient) => recipient.identifier) : undefined,
      subject: draft.subject ?? "",
      body: draft.bodyText ?? "",
      bodyFormat: "markdown",
      attachments,
      ...draftBinding,
    });
  }

  if (options.newThread) {
    return startChatAction({
      connectedAccountId: draft.connectedAccountId,
      attendeeIdentifiers: recipients,
      text: draft.bodyText ?? "",
      attachments,
      ...draftBinding,
    });
  }

  return sendChatMessageAction({
    threadId: draft.messagingThreadId,
    text: draft.bodyText ?? "",
    attachments,
    ...draftBinding,
  });
}
