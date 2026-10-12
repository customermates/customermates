import type { ZodOpenApiOperationObject } from "zod-openapi";

import { z } from "zod";

import { WebhookPublicDtoSchema } from "./webhook.schema";

import { StructuredApiResponses } from "@/core/api/structured-interactor-handler";

export const getWebhookOperation: ZodOpenApiOperationObject = {
  operationId: "getWebhook",
  summary: "Get a webhook subscription",
  description:
    "Returns one webhook subscription by ID, or null when no webhook with this id is accessible. The signing secret itself is never returned.",
  tags: ["webhooks"],
  security: [{ apiKeyAuth: [] }],
  requestParams: { path: z.object({ id: z.uuid() }) },
  responses: {
    "200": {
      description: "The webhook subscription, or null when no webhook with this id is accessible.",
      content: {
        "application/json": {
          schema: WebhookPublicDtoSchema.nullable(),
        },
      },
    },
    "400": StructuredApiResponses["400"],
    "401": StructuredApiResponses["401"],
    "403": StructuredApiResponses["403"],
    "500": StructuredApiResponses["500"],
  },
};
