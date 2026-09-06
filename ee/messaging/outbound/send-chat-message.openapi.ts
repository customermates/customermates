import type { ZodOpenApiOperationObject } from "zod-openapi";

import { z } from "zod";

import { BaseSendChatMessageSchema } from "@/ee/messaging/outbound/send-chat-message.interactor";
import { MessagingMessageDtoSchema } from "@/ee/messaging/inbox/inbox.schema";
import { CommonApiResponses } from "@/core/api/interactor-handler";

export const sendChatMessageOperation: ZodOpenApiOperationObject = {
  operationId: "sendChatMessage",
  summary: "Send a chat message",
  description:
    "Sends a real message into an existing chat thread (LinkedIn, WhatsApp, etc.). This delivers a real message as a side effect. When delivering a saved draft, pass both draftMessageId and its opaque draftRevision so a newer edit cannot be consumed.",
  tags: ["messaging"],
  security: [{ apiKeyAuth: [] }],
  requestParams: { path: z.object({ id: z.uuid() }) },
  requestBody: {
    required: true,
    content: {
      "application/json": {
        schema: BaseSendChatMessageSchema.omit({ threadId: true }),
      },
    },
  },
  responses: {
    "201": {
      description: "The message was sent successfully. Returns the persisted message.",
      content: {
        "application/json": {
          schema: MessagingMessageDtoSchema,
        },
      },
    },
    ...CommonApiResponses,
  },
};
