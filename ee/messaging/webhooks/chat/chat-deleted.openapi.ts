import type { ZodOpenApiOperationObject } from "zod-openapi";

import z from "zod";

import { EventEnvelopeSchema } from "@/features/event/event-envelope";

import { MessagingProvider } from "@/generated/prisma";

const PayloadSchema = z.object({
  connectedAccountId: z.uuid(),
  provider: z.enum(MessagingProvider),
  providerThreadId: z.string(),
  threadId: z.string(),
});

export const WebhookMessagingChatDeletedSchema = EventEnvelopeSchema.extend({
  event: z.literal("messaging.chat.deleted"),
  actorId: z.null(),
  data: PayloadSchema.extend({ entityId: z.uuid() }),
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
