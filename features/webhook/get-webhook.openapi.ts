import type { ZodOpenApiOperationObject } from "zod-openapi";

import { z } from "zod";

import { WebhookPublicDtoSchema } from "./webhook.schema";

import { StructuredApiResponses } from "@/core/api/structured-interactor-handler";

export const getWebhookOperation: ZodOpenApiOperationObject = {
  operationId: "getWebhook",
  summary: "Get a webhook subscription",
  description:
    "Returns one webhook subscription by ID. An id that does not exist or belongs to another workspace answers 404 not_found. The signing secret itself is never returned.",
  tags: ["webhooks"],
  security: [{ apiKeyAuth: [] }],
  requestParams: { path: z.object({ id: z.uuid() }) },
  responses: {
    "200": {
      description: "The webhook subscription.",
      content: {
        "application/json": {
          schema: WebhookPublicDtoSchema,
        },
      },
    },
    "400": StructuredApiResponses["400"],
    "401": StructuredApiResponses["401"],
    "403": StructuredApiResponses["403"],
    "404": StructuredApiResponses["404"],
    "500": StructuredApiResponses["500"],
  },
};
