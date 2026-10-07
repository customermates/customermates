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

export const WebhookMessagingEmailDeletedSchema = EventEnvelopeSchema.extend({
  event: z.literal("messaging.email.deleted"),
  actorId: z.null(),
  data: PayloadSchema.extend({ entityId: z.uuid() }),
});

export const webhookMessagingEmailDeletedOperation: ZodOpenApiOperationObject = {
  operationId: "webhookMessagingEmailDeleted",
  summary: "Email Deleted",
  description: "Sent when the provider reports an email deletion.",
  tags: ["webhooks"],
  requestBody: {
    content: {
      "application/json": {
        schema: WebhookMessagingEmailDeletedSchema,
      },
    },
  },
  responses: {
    "200": {
      description: "Webhook received successfully",
    },
  },
};
