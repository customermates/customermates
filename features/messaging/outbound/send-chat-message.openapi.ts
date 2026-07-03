import type { ZodOpenApiOperationObject } from "zod-openapi";

import { z } from "zod";

import { BaseSendChatMessageSchema } from "@/ee/messaging/outbound/send-chat-message.interactor";
import { CommonApiResponses } from "@/core/api/interactor-handler";

export const sendChatMessageOperation: ZodOpenApiOperationObject = {
  operationId: "sendChatMessage",
  summary: "Send a chat message",
  description:
    "Sends a real message into an existing chat thread (LinkedIn, WhatsApp, etc.). This delivers a real message as a side effect.",
  tags: ["messaging"],
  security: [{ apiKeyAuth: [] }],
  requestParams: { path: z.object({ id: z.uuid() }) },
  requestBody: {
    content: {
      "application/json": {
        schema: BaseSendChatMessageSchema.omit({ threadId: true }),
      },
    },
  },
  responses: {
    "201": {
      description: "The message was sent successfully.",
      content: {
        "application/json": {
          schema: z.null(),
        },
      },
    },
    ...CommonApiResponses,
  },
};
