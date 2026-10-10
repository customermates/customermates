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

export const WebhookMessagingChatUpdatedSchema = EventEnvelopeSchema.extend({
  event: z.literal("messaging.chat.updated"),
  actorId: z.null(),
  data: PayloadSchema.extend({ entityId: z.uuid() }),
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
