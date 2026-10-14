import type { ZodOpenApiOperationObject } from "zod-openapi";

import z from "zod";

import { EventEnvelopeSchema } from "@/features/event/event-envelope";

const PayloadSchema = z.object({
  connectedAccountId: z.uuid(),
  providerCalendarId: z.string(),
});

export const WebhookMessagingCalendarChangedSchema = EventEnvelopeSchema.extend({
  event: z.literal("messaging.calendar.changed"),
  actorId: z.null(),
  data: PayloadSchema.extend({ entityId: z.uuid() }),
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
