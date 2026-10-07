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

export const WebhookMessagingEmailReceivedSchema = EventEnvelopeSchema.extend({
  event: z.literal("messaging.email.received"),
  actorId: z.null(),
  data: PayloadSchema.extend({ entityId: z.uuid() }),
});

export const webhookMessagingEmailReceivedOperation: ZodOpenApiOperationObject = {
  operationId: "webhookMessagingEmailReceived",
  summary: "Email Received",
  description: "Sent when a new email is ingested on a connected email account.",
  tags: ["webhooks"],
  requestBody: {
    content: {
      "application/json": {
        schema: WebhookMessagingEmailReceivedSchema,
      },
    },
  },
  responses: {
    "200": {
      description: "Webhook received successfully",
    },
  },
};
