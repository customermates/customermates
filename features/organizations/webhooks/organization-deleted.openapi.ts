import type { ZodOpenApiOperationObject } from "zod-openapi";

import z from "zod";

import { OrganizationDtoSchema } from "../organization.schema";

export const WebhookOrganizationDeletedSchema = z.object({
  event: z.literal("organization.deleted"),
  data: z.object({
    userId: z.uuid(),
    companyId: z.uuid(),
    entityId: z.uuid(),
    payload: OrganizationDtoSchema,
  }),
  timestamp: z.date(),
});

export const webhookOrganizationDeletedOperation: ZodOpenApiOperationObject = {
  operationId: "webhookOrganizationDeleted",
  summary: "Organization Deleted",
  description: "Sent when an organization is deleted.",
  tags: ["webhooks"],
  requestBody: {
    content: {
      "application/json": {
        schema: WebhookOrganizationDeletedSchema,
      },
    },
  },
  responses: {
    "200": {
      description: "Webhook received successfully",
    },
  },
};
