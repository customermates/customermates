import type { ZodOpenApiOperationObject } from "zod-openapi";

import z from "zod";

import { ServiceDtoSchema } from "../service.schema";

export const WebhookServiceDeletedSchema = z.object({
  event: z.literal("service.deleted"),
  data: z.object({
    userId: z.uuid(),
    companyId: z.uuid(),
    entityId: z.uuid(),
    payload: ServiceDtoSchema,
  }),
  timestamp: z.date(),
});

export const webhookServiceDeletedOperation: ZodOpenApiOperationObject = {
  operationId: "webhookServiceDeleted",
  summary: "Service Deleted",
  description: "Sent when a service is deleted.",
  tags: ["webhooks"],
  requestBody: {
    content: {
      "application/json": {
        schema: WebhookServiceDeletedSchema,
      },
    },
  },
  responses: {
    "200": {
      description: "Webhook received successfully",
    },
  },
};
