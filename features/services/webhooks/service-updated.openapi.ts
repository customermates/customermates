import type { ZodOpenApiOperationObject } from "zod-openapi";

import z from "zod";

import { ServiceDtoSchema } from "../service.schema";
import { changesSchema } from "@/core/openapi/changes-schema";

export const WebhookServiceUpdatedSchema = z.object({
  event: z.literal("service.updated"),
  data: z.object({
    userId: z.uuid(),
    companyId: z.uuid(),
    entityId: z.uuid(),
    payload: z.object({
      service: ServiceDtoSchema,
      changes: changesSchema(ServiceDtoSchema.shape),
    }),
  }),
  timestamp: z.iso.datetime(),
});

export const webhookServiceUpdatedOperation: ZodOpenApiOperationObject = {
  operationId: "webhookServiceUpdated",
  summary: "Service Updated",
  description: "Sent when a service is updated.",
  tags: ["webhooks"],
  requestBody: {
    content: {
      "application/json": {
        schema: WebhookServiceUpdatedSchema,
      },
    },
  },
  responses: {
    "200": {
      description: "Webhook received successfully",
    },
  },
};
