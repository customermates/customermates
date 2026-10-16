import type { Data } from "@/core/validation/validation.utils";
import type { MessagingMessage } from "../messaging.schema";
import type { MessagingMessageDto } from "../inbox/inbox.schema";

import { z } from "zod";

import { MessagingMessageDtoSchema, toMessagingMessageDto } from "../inbox/inbox.schema";

const RepeatedSchema = z
  .boolean()
  .describe("true when this answers an earlier accepted send of the same draft revision; nothing was sent again");

export const SentMessageResultSchema = z.object({
  message: MessagingMessageDtoSchema.nullable(),
  messageId: z.uuid().nullable(),
  threadId: z.uuid().nullable(),
  providerMessageId: z.string().nullable(),
  repeated: z.boolean(),
});
export type SentMessageResult = Data<typeof SentMessageResultSchema>;

export const SentMessageSchema = MessagingMessageDtoSchema.extend({ repeated: RepeatedSchema });
export type SentMessage = Data<typeof SentMessageSchema>;

export const SentMessageReceiptSchema = SentMessageResultSchema.omit({ message: true })
  .extend({ sent: z.literal(true), repeated: RepeatedSchema })
  .describe(
    "The provider accepted the message. messageId and threadId are null while the sent copy is not recorded yet.",
  );
export type SentMessageReceipt = Data<typeof SentMessageReceiptSchema>;

export function toSentMessageResult(args: {
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

export function toSentMessage(message: MessagingMessageDto, repeated: boolean): SentMessage {
  return { ...message, repeated };
}

export function toSentMessageReceipt(result: SentMessageResult): SentMessageReceipt {
  return {
    sent: true,
    messageId: result.messageId,
    threadId: result.threadId,
    providerMessageId: result.providerMessageId,
    repeated: result.repeated,
  };
}
