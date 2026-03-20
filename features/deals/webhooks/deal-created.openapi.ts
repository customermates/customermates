import type { ZodOpenApiOperationObject } from "zod-openapi";

import z from "zod";

import { DealDtoSchema } from "../deal.schema";

export const WebhookDealCreatedSchema = z.object({
  event: z.literal("deal.created"),
  data: z.object({
    userId: z.uuid(),
    companyId: z.uuid(),
    entityId: z.uuid(),
    payload: DealDtoSchema,
  }),
  timestamp: z.date(),
});

export const webhookDealCreatedOperation: ZodOpenApiOperationObject = {
  operationId: "webhookDealCreated",
  summary: "Deal Created",
  description: "Sent when a deal is created.",
  tags: ["webhooks"],
  requestBody: {
    content: {
      "application/json": {
        schema: WebhookDealCreatedSchema,
      },
    },
  },
  responses: {
    "200": {
      description: "Webhook received successfully",
    },
  },
};
