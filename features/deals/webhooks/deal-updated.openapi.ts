import type { ZodOpenApiOperationObject } from "zod-openapi";

import z from "zod";

import { DealDtoSchema } from "../deal.schema";
import { changesSchema } from "@/core/openapi/changes-schema";

export const WebhookDealUpdatedSchema = z.object({
  event: z.literal("deal.updated"),
  data: z.object({
    userId: z.uuid(),
    companyId: z.uuid(),
    entityId: z.uuid(),
    payload: z.object({
      deal: DealDtoSchema,
      changes: changesSchema(DealDtoSchema.shape),
    }),
  }),
  timestamp: z.iso.datetime(),
});

export const webhookDealUpdatedOperation: ZodOpenApiOperationObject = {
  operationId: "webhookDealUpdated",
  summary: "Deal Updated",
  description: "Sent when a deal is updated.",
  tags: ["webhooks"],
  requestBody: {
    content: {
      "application/json": {
        schema: WebhookDealUpdatedSchema,
      },
    },
  },
  responses: {
    "200": {
      description: "Webhook received successfully",
    },
  },
};
