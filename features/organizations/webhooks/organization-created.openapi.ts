import type { ZodOpenApiOperationObject } from "zod-openapi";

import z from "zod";

import { OrganizationDtoSchema } from "../organization.schema";

export const WebhookOrganizationCreatedSchema = z.object({
  event: z.literal("organization.created"),
  data: z.object({
    userId: z.uuid(),
    companyId: z.uuid(),
    entityId: z.uuid(),
    payload: OrganizationDtoSchema,
  }),
  timestamp: z.date(),
});

export const webhookOrganizationCreatedOperation: ZodOpenApiOperationObject = {
  operationId: "webhookOrganizationCreated",
  summary: "Organization Created",
  description: "Sent when an organization is created.",
  tags: ["webhooks"],
  requestBody: {
    content: {
      "application/json": {
        schema: WebhookOrganizationCreatedSchema,
      },
    },
  },
  responses: {
    "200": {
      description: "Webhook received successfully",
    },
  },
};
