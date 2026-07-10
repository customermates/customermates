import type { ZodOpenApiOperationObject } from "zod-openapi";

import z from "zod";

import { MessagingProvider } from "@/generated/prisma";

const PayloadSchema = z.object({
  connectedAccountId: z.uuid(),
  provider: z.enum(MessagingProvider),
  providerThreadId: z.string(),
});

export const WebhookMessagingChatDeletedSchema = z.object({
  event: z.literal("messaging.chat.deleted"),
  data: z.object({
    userId: z.null(),
    companyId: z.uuid(),
    entityId: z.uuid(),
    payload: PayloadSchema,
  }),
  timestamp: z.iso.datetime(),
});

export const webhookMessagingChatDeletedOperation: ZodOpenApiOperationObject = {
  operationId: "webhookMessagingChatDeleted",
  summary: "Chat Deleted",
  description: "Sent when the provider reports a chat thread deletion.",
  tags: ["webhooks"],
  requestBody: {
    content: {
      "application/json": {
        schema: WebhookMessagingChatDeletedSchema,
      },
    },
  },
  responses: {
    "200": {
      description: "Webhook received successfully",
    },
  },
};
