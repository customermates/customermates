import type { ZodOpenApiOperationObject } from "zod-openapi";

import { z } from "zod";

import { StructuredApiResponses } from "@/core/api/structured-interactor-handler";
import { ListQueryParamsSchema } from "@/core/api/list-query-params";
import { createGetResultSchema } from "@/core/base/base-get.schema";

import { WebhookDeliveryDtoSchema } from "./get-webhook-deliveries.interactor";
import { UpsertWebhookSchema } from "./upsert-webhook.interactor";
import { WebhookPublicDtoSchema } from "./webhook.schema";

const WEBHOOK_ID = "4f3e2d1c-0b9a-4876-9543-210fedcba987";
const DELIVERY_ID = "8e7d6c5b-4a39-4281-8f0e-d9c8b7a69584";

const exampleWebhook = {
  id: WEBHOOK_ID,
  url: "https://hooks.example.com/customermates",
  description: "Sync new records to the data warehouse",
  events: ["record.created", "record.updated"],
  bodyTemplate: null,
  enabled: true,
  pausedReason: null,
  recordTrigger: null,
  recordSources: null,
  recordOwnerUserId: null,
  createdAt: "2026-10-12T08:00:00.000Z",
  updatedAt: "2026-10-12T08:00:00.000Z",
  hasSecret: true,
  headerNames: ["Authorization"],
};

const exampleDelivery = {
  id: DELIVERY_ID,
  url: "https://hooks.example.com/customermates",
  event: "record.created",
  requestBody: { event: "record.created", data: {} },
  nextAttemptAt: null,
  statusCode: 200,
  responseMessage: "OK",
  success: true,
  status: "success",
  deliveredAt: "2026-10-12T08:00:02.000Z",
  createdAt: "2026-10-12T08:00:00.000Z",
};

const WebhookPathParamsSchema = z.object({ id: z.uuid().describe("The webhook id.") });

export const UpdateWebhookApiSchema = z
  .object(UpsertWebhookSchema.shape)
  .omit({ id: true })
  .describe(
    "Only the supplied fields change. events replaces the subscribed events. Omit secret to keep it, pass null to clear it or a string to set a new one; headers follow the same rule. Send an empty object to change nothing.",
  );

export const ResendWebhookDeliveryApiSchema = z
  .object({})
  .describe("No fields; send an empty object. The webhook and delivery come from the path.");

export const ResendWebhookDeliveryResultSchema = z.object({
  resentDeliveryId: z.uuid().describe("The delivery that was resent."),
  deliveryId: z.uuid().describe("The new queued delivery."),
});

export const listWebhooksOperation: ZodOpenApiOperationObject = {
  operationId: "listWebhooks",
  summary: "List webhook subscriptions",
  description:
    "Lists the workspace's webhook subscriptions. searchTerm matches url and description; sortField takes name, createdAt or updatedAt. Secrets and header values are never returned. Requires: read all permission on the API.",
  tags: ["webhooks"],
  security: [{ apiKeyAuth: [] }],
  requestParams: { query: ListQueryParamsSchema },
  responses: {
    "200": {
      description: "One page of webhook subscriptions.",
      content: {
        "application/json": {
          schema: createGetResultSchema(WebhookPublicDtoSchema),
          example: { items: [exampleWebhook], pagination: { page: 1, pageSize: 25, totalPages: 1, total: 1 } },
        },
      },
    },
    ...StructuredApiResponses,
  },
};

export const updateWebhookOperation: ZodOpenApiOperationObject = {
  operationId: "updateWebhook",
  summary: "Update a webhook subscription",
  description:
    "Changes the supplied fields of one webhook subscription and leaves the rest unchanged. The example disables a webhook and replaces its events. An id outside the workspace answers 404. Requires: update permission on the API.",
  tags: ["webhooks"],
  security: [{ apiKeyAuth: [] }],
  requestParams: { path: WebhookPathParamsSchema },
  requestBody: {
    required: true,
    content: {
      "application/json": {
        schema: UpdateWebhookApiSchema,
        example: { enabled: false, events: ["record.created"] },
      },
    },
  },
  responses: {
    "200": {
      description: "The updated webhook subscription.",
      content: {
        "application/json": {
          schema: WebhookPublicDtoSchema,
          example: { ...exampleWebhook, enabled: false, events: ["record.created"] },
        },
      },
    },
    ...StructuredApiResponses,
  },
};

export const listWebhookDeliveriesOperation: ZodOpenApiOperationObject = {
  operationId: "listWebhookDeliveries",
  summary: "List a webhook's deliveries",
  description:
    "Lists the deliveries of one webhook newest first, with status, response code and the delivered body. searchTerm matches url and event name. A webhook outside the workspace answers 404. Requires: read all permission on the API.",
  tags: ["webhooks"],
  security: [{ apiKeyAuth: [] }],
  requestParams: { path: WebhookPathParamsSchema, query: ListQueryParamsSchema },
  responses: {
    "200": {
      description: "One page of deliveries.",
      content: {
        "application/json": {
          schema: createGetResultSchema(WebhookDeliveryDtoSchema),
          example: { items: [exampleDelivery], pagination: { page: 1, pageSize: 25, totalPages: 1, total: 1 } },
        },
      },
    },
    ...StructuredApiResponses,
  },
};

export const resendWebhookDeliveryOperation: ZodOpenApiOperationObject = {
  operationId: "resendWebhookDelivery",
  summary: "Resend a webhook delivery",
  description:
    "Queues a new delivery of a finished delivery's event to the webhook's current url. The webhook must still be enabled and subscribed to the event; otherwise, or when its record trigger changed since, the request answers 409. A delivery that does not belong to the webhook answers 404. Requires: create permission on the API.",
  tags: ["webhooks"],
  security: [{ apiKeyAuth: [] }],
  requestParams: {
    path: WebhookPathParamsSchema.extend({ deliveryId: z.uuid().describe("The delivery to resend.") }),
  },
  requestBody: {
    required: true,
    content: { "application/json": { schema: ResendWebhookDeliveryApiSchema, example: {} } },
  },
  responses: {
    "202": {
      description: "The new delivery was queued.",
      content: {
        "application/json": {
          schema: ResendWebhookDeliveryResultSchema,
          example: { resentDeliveryId: DELIVERY_ID, deliveryId: "1a2b3c4d-5e6f-4a1b-8c2d-3e4f5a6b7c8d" },
        },
      },
    },
    ...StructuredApiResponses,
  },
};
