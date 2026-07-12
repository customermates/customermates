import type { ZodOpenApiOperationObject } from "zod-openapi";

import { z } from "zod";

import { CommonApiResponses } from "@/core/api/interactor-handler";

export const deleteWebhookOperation: ZodOpenApiOperationObject = {
  operationId: "deleteWebhook",
  summary: "Delete a webhook subscription",
  description: "Removes a webhook subscription so it stops receiving deliveries.",
  tags: ["webhooks"],
  security: [{ apiKeyAuth: [] }],
  requestParams: { path: z.object({ id: z.uuid() }) },
  responses: {
    "200": {
      description: "The webhook subscription was deleted.",
      content: {
        "application/json": {
          schema: z.string(),
        },
      },
    },
    ...CommonApiResponses,
  },
};
