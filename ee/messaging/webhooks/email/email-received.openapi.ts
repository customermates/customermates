import type { ZodOpenApiOperationObject } from "zod-openapi";

import z from "zod";

import { MessagingProvider } from "@/generated/prisma";

const PayloadSchema = z.object({
  connectedAccountId: z.uuid(),
  provider: z.enum(MessagingProvider),
  providerMessageId: z.string(),
  threadId: z.uuid(),
});

export const WebhookMessagingEmailReceivedSchema = z.object({
  event: z.literal("messaging.email.received"),
  data: z.object({
    userId: z.null(),
    companyId: z.uuid(),
    entityId: z.uuid(),
    payload: PayloadSchema,
  }),
  timestamp: z.iso.datetime(),
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
