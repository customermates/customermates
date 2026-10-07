import type { ZodOpenApiOperationObject } from "zod-openapi";

import z from "zod";

import { EventEnvelopeSchema } from "@/features/event/event-envelope";

const PayloadSchema = z.object({
  connectedAccountId: z.uuid(),
  providerCalendarId: z.string(),
  providerEventId: z.string(),
});

export const WebhookMessagingCalendarEventChangedSchema = EventEnvelopeSchema.extend({
  event: z.literal("messaging.calendar_event.changed"),
  actorId: z.null(),
  data: PayloadSchema.extend({ entityId: z.uuid() }),
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
