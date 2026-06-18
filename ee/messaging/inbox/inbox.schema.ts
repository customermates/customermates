import type { Data } from "@/core/validation/validation.utils";

import { z } from "zod";

import {
  AttachmentMetaSchema,
  MessageReactionEntrySchema,
  MessagingAttendeeSchema,
  MessagingMessageSchema,
} from "../messaging.schema";

export const MessagingMessageDtoSchema = MessagingMessageSchema.omit({
  unipileMessageId: true,
  origin: true,
  createdAt: true,
  updatedAt: true,
}).extend({
  recipients: z.object({ to: z.array(MessagingAttendeeSchema).default([]) }),
  attachmentsMeta: z.array(AttachmentMetaSchema.omit({ url: true }).extend({ linkUrl: z.string().nullish() })),
  reactions: z.array(MessageReactionEntrySchema.pick({ value: true })).default([]),
});
export type MessagingMessageDto = Data<typeof MessagingMessageDtoSchema>;
