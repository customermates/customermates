import type { ZodOpenApiOperationObject } from "zod-openapi";

import z from "zod";

import { MessagingProvider } from "@/generated/prisma";

const PayloadSchema = z.object({
  connectedAccountId: z.uuid(),
  provider: z.enum(MessagingProvider),
  providerUserId: z.string(),
});

export const WebhookMessagingRelationCreatedSchema = z.object({
  event: z.literal("messaging.relation.created"),
  data: z.object({
    userId: z.null(),
    companyId: z.uuid(),
    entityId: z.uuid(),
    payload: PayloadSchema,
  }),
  timestamp: z.iso.datetime(),
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
