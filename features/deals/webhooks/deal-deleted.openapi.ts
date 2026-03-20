import type { ZodOpenApiOperationObject } from "zod-openapi";

import z from "zod";

import { DealDtoSchema } from "../deal.schema";

export const WebhookDealDeletedSchema = z.object({
  event: z.literal("deal.deleted"),
  data: z.object({
    userId: z.uuid(),
    companyId: z.uuid(),
    entityId: z.uuid(),
    payload: DealDtoSchema,
  }),
  timestamp: z.date(),
});

export const webhookDealDeletedOperation: ZodOpenApiOperationObject = {
  operationId: "webhookDealDeleted",
  summary: "Deal Deleted",
  description: "Sent when a deal is deleted.",
  tags: ["webhooks"],
  requestBody: {
    content: {
      "application/json": {
        schema: WebhookDealDeletedSchema,
      },
    },
  },
  responses: {
    "200": {
      description: "Webhook received successfully",
    },
  },
};
