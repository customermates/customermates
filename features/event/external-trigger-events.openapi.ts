import type { ZodOpenApiOperationObject } from "zod-openapi";

import z from "zod";

import { EventEnvelopeSchema } from "./event-envelope";
import { BOOKING_CHANGES } from "./external-trigger-events";

const FormSubmittedPayloadSchema = z.object({
  source: z.enum(["form", "booking"]),
  formId: z.uuid(),
  formName: z.string(),
  typeId: z.uuid(),
  submissionId: z.string(),
  outcome: z.enum(["created", "duplicate"]),
  recordId: z.uuid().nullable(),
  personRecordId: z.uuid().nullable(),
  answers: z.record(z.string(), z.string()),
});

const WebhookReceivedPayloadSchema = z.object({
  webhookId: z.uuid(),
  webhookName: z.string(),
  typeId: z.uuid(),
  deliveryId: z.string(),
  outcome: z.enum(["created", "updated"]),
  recordId: z.uuid().nullable(),
});

const BookingChangedPayloadSchema = z.object({
  bookingId: z.uuid(),
  bookingLinkId: z.uuid(),
  bookingLinkName: z.string(),
  change: z.enum(BOOKING_CHANGES),
  by: z.enum(["invitee", "host"]),
  typeId: z.uuid().nullable(),
  recordId: z.uuid().nullable(),
  personRecordId: z.uuid().nullable(),
  hostUserId: z.uuid(),
  answers: z.record(z.string(), z.string()),
});

export const WebhookFormSubmittedSchema = EventEnvelopeSchema.extend({
  event: z.literal("form.submitted"),
  actorId: z.null(),
  data: FormSubmittedPayloadSchema.extend({ entityId: z.string() }),
});

export const WebhookWebhookReceivedSchema = EventEnvelopeSchema.extend({
  event: z.literal("webhook.received"),
  actorId: z.null(),
  data: WebhookReceivedPayloadSchema.extend({ entityId: z.string() }),
});

export const WebhookBookingChangedSchema = EventEnvelopeSchema.extend({
  event: z.literal("booking.changed"),
  actorId: z.null(),
  data: BookingChangedPayloadSchema.extend({ entityId: z.string() }),
});

export const webhookFormSubmittedOperation: ZodOpenApiOperationObject = {
  operationId: "webhookFormSubmitted",
  summary: "Form Submitted",
  description:
    "Sent when a public form or booking page receives a submission. `data.outcome` is `duplicate` when the same submission arrived twice; `data.recordId` is the record the submission created, `data.answers` the submitted answers by field label.",
  tags: ["webhooks"],
  requestBody: {
    content: {
      "application/json": {
        schema: WebhookFormSubmittedSchema,
      },
    },
  },
  responses: {
    "200": {
      description: "Webhook received successfully",
    },
  },
};

export const webhookWebhookReceivedOperation: ZodOpenApiOperationObject = {
  operationId: "webhookWebhookReceived",
  summary: "Webhook Received",
  description:
    "Sent when an incoming webhook endpoint accepted a request and created or updated a record. `data.outcome` says which, `data.recordId` is the record.",
  tags: ["webhooks"],
  requestBody: {
    content: {
      "application/json": {
        schema: WebhookWebhookReceivedSchema,
      },
    },
  },
  responses: {
    "200": {
      description: "Webhook received successfully",
    },
  },
};

export const webhookBookingChangedOperation: ZodOpenApiOperationObject = {
  operationId: "webhookBookingChanged",
  summary: "Booking Changed",
  description:
    "Sent when the invitee or the host cancelled or rescheduled a booking. `data.change` is `cancelled` or `rescheduled`, `data.by` says who changed it, `data.recordId` is the record the booking created or `null`, `data.answers` holds name, email, the times and the visitor's answers by field label.",
  tags: ["webhooks"],
  requestBody: {
    content: {
      "application/json": {
        schema: WebhookBookingChangedSchema,
      },
    },
  },
  responses: {
    "200": {
      description: "Webhook received successfully",
    },
  },
};
