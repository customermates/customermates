import type { ZodOpenApiOperationObject } from "zod-openapi";

import z from "zod";

const PayloadSchema = z.object({
  connectedAccountId: z.uuid(),
  providerCalendarId: z.string(),
});

export const WebhookMessagingCalendarChangedSchema = z.object({
  event: z.literal("messaging.calendar.changed"),
  data: z.object({
    userId: z.null(),
    companyId: z.uuid(),
    entityId: z.uuid(),
    payload: PayloadSchema,
  }),
  timestamp: z.iso.datetime(),
});

export const webhookMessagingCalendarChangedOperation: ZodOpenApiOperationObject = {
  operationId: "webhookMessagingCalendarChanged",
  summary: "Calendar Changed",
  description: "Sent when a calendar on a connected account is created, updated, or deleted.",
  tags: ["webhooks"],
  requestBody: {
    content: {
      "application/json": {
        schema: WebhookMessagingCalendarChangedSchema,
      },
    },
  },
  responses: {
    "200": {
      description: "Webhook received successfully",
    },
  },
};
