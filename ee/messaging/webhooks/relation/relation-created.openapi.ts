import type { ZodOpenApiOperationObject } from "zod-openapi";

import z from "zod";

import { EventEnvelopeSchema } from "@/features/event/event-envelope";

import { MessagingProvider } from "@/generated/prisma";

const PayloadSchema = z.object({
  connectedAccountId: z.uuid(),
  provider: z.enum(MessagingProvider),
  providerUserId: z.string(),
});

export const WebhookMessagingRelationCreatedSchema = EventEnvelopeSchema.extend({
  event: z.literal("messaging.relation.created"),
  actorId: z.null(),
  data: PayloadSchema.extend({ entityId: z.uuid() }),
});

export const webhookMessagingRelationCreatedOperation: ZodOpenApiOperationObject = {
  operationId: "webhookMessagingRelationCreated",
  summary: "Relation Created",
  description: "Sent when the provider reports a new connection (e.g. an accepted LinkedIn invitation).",
  tags: ["webhooks"],
  requestBody: {
    content: {
      "application/json": {
        schema: WebhookMessagingRelationCreatedSchema,
      },
    },
  },
  responses: {
    "200": {
      description: "Webhook received successfully",
    },
  },
};
