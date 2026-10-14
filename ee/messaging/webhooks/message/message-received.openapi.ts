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

export const WebhookMessagingMessageReceivedSchema = EventEnvelopeSchema.extend({
  event: z.literal("messaging.message.received"),
  actorId: z.null(),
  data: PayloadSchema.extend({ entityId: z.uuid() }),
});

export const webhookMessagingMessageReceivedOperation: ZodOpenApiOperationObject = {
  operationId: "webhookMessagingMessageReceived",
  summary: "Message Received",
  description: "Sent when a new chat message or email is ingested on a connected account.",
  tags: ["webhooks"],
  requestBody: {
    content: {
      "application/json": {
        schema: WebhookMessagingMessageReceivedSchema,
      },
    },
  },
  responses: {
    "200": {
      description: "Webhook received successfully",
    },
  },
};
