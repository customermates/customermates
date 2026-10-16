import type { Data } from "@/core/validation/validation.utils";
import type { MessagingMessage } from "../messaging.schema";

import { z } from "zod";

import { MessagingMessageDtoSchema, toMessagingMessageDto } from "../inbox/inbox.schema";

export const SentMessageResultSchema = z.object({
  message: MessagingMessageDtoSchema.nullable(),
  messageId: z.uuid().nullable(),
  threadId: z.uuid().nullable(),
  providerMessageId: z.string().nullable(),
  repeated: z.boolean(),
});
export type SentMessageResult = Data<typeof SentMessageResultSchema>;

export const SentMessageReceiptSchema = SentMessageResultSchema.omit({ message: true })
  .extend({ sent: z.literal(true) })
  .describe(
    "The provider accepted the message. messageId and threadId stay null until the sent copy is recorded; repeated is true when this answers an earlier accepted send of the same draft revision and nothing was sent again.",
  );
export type SentMessageReceipt = Data<typeof SentMessageReceiptSchema>;

export function sentMessageResult(args: {
  message: MessagingMessage | null;
  messageId?: string | null;
  threadId?: string | null;
  providerMessageId?: string | null;
  repeated?: boolean;
}): SentMessageResult {
  return {
    message: args.message ? toMessagingMessageDto(args.message) : null,
    messageId: args.message?.id ?? args.messageId ?? null,
    threadId: args.message?.messagingThreadId ?? args.threadId ?? null,
    providerMessageId: args.message?.providerMessageId ?? args.providerMessageId ?? null,
    repeated: args.repeated ?? false,
  };
}

export function sentMessageReceipt(result: SentMessageResult): SentMessageReceipt {
  return {
    sent: true,
    messageId: result.messageId,
    threadId: result.threadId,
    providerMessageId: result.providerMessageId,
    repeated: result.repeated,
  };
}
