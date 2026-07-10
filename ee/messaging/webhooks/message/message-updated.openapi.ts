import type { ZodOpenApiOperationObject } from "zod-openapi";

import z from "zod";

import { MessagingProvider } from "@/generated/prisma";

const PayloadSchema = z.object({
  connectedAccountId: z.uuid(),
  provider: z.enum(MessagingProvider),
  providerMessageId: z.string(),
  threadId: z.uuid(),
});

export const WebhookMessagingMessageUpdatedSchema = z.object({
  event: z.literal("messaging.message.updated"),
  data: z.object({
    userId: z.null(),
    companyId: z.uuid(),
    entityId: z.uuid(),
    payload: PayloadSchema,
  }),
  timestamp: z.iso.datetime(),
});

export const webhookMessagingMessageUpdatedOperation: ZodOpenApiOperationObject = {
  operationId: "webhookMessagingMessageUpdated",
  summary: "Message Updated",
  description: "Sent when the provider reports an edit or status change for an ingested message.",
  tags: ["webhooks"],
  requestBody: {
    content: {
      "application/json": {
        schema: WebhookMessagingMessageUpdatedSchema,
      },
    },
  },
  responses: {
    "200": {
      description: "Webhook received successfully",
    },
  },
};
