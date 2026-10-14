import type { ZodOpenApiOperationObject } from "zod-openapi";

import z from "zod";

import { EventEnvelopeSchema } from "@/features/event/event-envelope";

import { MessagingProvider } from "@/generated/prisma";

const PayloadSchema = z.object({
  connectedAccountId: z.uuid(),
  provider: z.enum(MessagingProvider),
  providerMessageId: z.string(),
  threadId: z.uuid(),
});

export const WebhookMessagingMessageReactionSchema = EventEnvelopeSchema.extend({
  event: z.literal("messaging.message.reaction"),
  actorId: z.null(),
  data: PayloadSchema.extend({ entityId: z.uuid() }),
});

export const webhookMessagingMessageReactionOperation: ZodOpenApiOperationObject = {
  operationId: "webhookMessagingMessageReaction",
  summary: "Message Reaction",
  description: "Sent when a reaction is added to or removed from a message.",
  tags: ["webhooks"],
  requestBody: {
    content: {
      "application/json": {
        schema: WebhookMessagingMessageReactionSchema,
      },
    },
  },
  responses: {
    "200": {
      description: "Webhook received successfully",
    },
  },
};
