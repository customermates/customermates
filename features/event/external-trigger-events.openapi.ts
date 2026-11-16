import type { ZodOpenApiOperationObject } from "zod-openapi";

import z from "zod";

import { EventEnvelopeSchema } from "./event-envelope";

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
