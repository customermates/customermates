import type { ZodOpenApiOperationObject } from "zod-openapi";

import z from "zod";

import { ServiceDtoSchema } from "../service.schema";

export const WebhookServiceCreatedSchema = z.object({
  event: z.literal("service.created"),
  data: z.object({
    userId: z.uuid(),
    companyId: z.uuid(),
    entityId: z.uuid(),
    payload: ServiceDtoSchema,
  }),
  timestamp: z.date(),
});

export const webhookServiceCreatedOperation: ZodOpenApiOperationObject = {
  operationId: "webhookServiceCreated",
  summary: "Service Created",
  description: "Sent when a service is created.",
  tags: ["webhooks"],
  requestBody: {
    content: {
      "application/json": {
        schema: WebhookServiceCreatedSchema,
      },
    },
  },
  responses: {
    "200": {
      description: "Webhook received successfully",
    },
  },
};
