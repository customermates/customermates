import type { ZodOpenApiOperationObject } from "zod-openapi";

import z from "zod";

import { MessagingProvider } from "@/generated/prisma";

const PayloadSchema = z.object({
  connectedAccountId: z.uuid(),
  provider: z.enum(MessagingProvider),
  providerThreadId: z.string(),
});

export const WebhookMessagingChatUpdatedSchema = z.object({
  event: z.literal("messaging.chat.updated"),
  data: z.object({
    userId: z.null(),
    companyId: z.uuid(),
    entityId: z.uuid(),
    payload: PayloadSchema,
  }),
  timestamp: z.iso.datetime(),
});

export const webhookMessagingChatUpdatedOperation: ZodOpenApiOperationObject = {
  operationId: "webhookMessagingChatUpdated",
  summary: "Chat Updated",
  description: "Sent when a chat thread's provider attributes change (name, mute state, read state).",
  tags: ["webhooks"],
  requestBody: {
    content: {
      "application/json": {
        schema: WebhookMessagingChatUpdatedSchema,
      },
    },
  },
  responses: {
    "200": {
      description: "Webhook received successfully",
    },
  },
};
