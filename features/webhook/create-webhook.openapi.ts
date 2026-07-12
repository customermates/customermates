import type { ZodOpenApiOperationObject } from "zod-openapi";

import { WebhookPublicDtoSchema } from "./webhook.schema";
import { UpsertWebhookSchema } from "./upsert-webhook.interactor";

import { CommonApiResponses } from "@/core/api/interactor-handler";

export const createWebhookOperation: ZodOpenApiOperationObject = {
  operationId: "createWebhook",
  summary: "Create a webhook subscription",
  description:
    "Subscribes an endpoint to the given events (url and events are required). Deliveries are signed with HMAC-SHA-256 in the X-Webhook-Signature header when a secret is set. The signing secret is never returned. Providing an existing id updates that subscription instead.",
  tags: ["webhooks"],
  security: [{ apiKeyAuth: [] }],
  requestBody: {
    content: {
      "application/json": {
        schema: UpsertWebhookSchema,
      },
    },
  },
  responses: {
    "201": {
      description: "The webhook subscription was created.",
      content: {
        "application/json": {
          schema: WebhookPublicDtoSchema,
        },
      },
    },
    ...CommonApiResponses,
  },
};
