import type { ZodOpenApiOperationObject } from "zod-openapi";

import z from "zod";

const PayloadSchema = z.object({
  connectedAccountId: z.uuid(),
  providerCalendarId: z.string(),
  providerEventId: z.string(),
});

export const WebhookMessagingCalendarEventChangedSchema = z.object({
  event: z.literal("messaging.calendar_event.changed"),
  data: z.object({
    userId: z.null(),
    companyId: z.uuid(),
    entityId: z.uuid(),
    payload: PayloadSchema,
  }),
  timestamp: z.iso.datetime(),
});

export const webhookMessagingCalendarEventChangedOperation: ZodOpenApiOperationObject = {
  operationId: "webhookMessagingCalendarEventChanged",
  summary: "Calendar Event Changed",
  description: "Sent when a calendar event on a connected account is created, updated, or deleted.",
  tags: ["webhooks"],
  requestBody: {
    content: {
      "application/json": {
        schema: WebhookMessagingCalendarEventChangedSchema,
      },
    },
  },
  responses: {
    "200": {
      description: "Webhook received successfully",
    },
  },
};
