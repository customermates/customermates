import type { ZodOpenApiOperationObject } from "zod-openapi";

import z from "zod";

import { OrganizationDtoSchema } from "../organization.schema";
import { changesSchema } from "@/core/openapi/changes-schema";

export const WebhookOrganizationUpdatedSchema = z.object({
  event: z.literal("organization.updated"),
  data: z.object({
    userId: z.uuid(),
    companyId: z.uuid(),
    entityId: z.uuid(),
    payload: z.object({
      organization: OrganizationDtoSchema,
      changes: changesSchema(OrganizationDtoSchema.shape),
    }),
  }),
  timestamp: z.iso.datetime(),
});

export const webhookOrganizationUpdatedOperation: ZodOpenApiOperationObject = {
  operationId: "webhookOrganizationUpdated",
  summary: "Organization Updated",
  description: "Sent when an organization is updated.",
  tags: ["webhooks"],
  requestBody: {
    content: {
      "application/json": {
        schema: WebhookOrganizationUpdatedSchema,
      },
    },
  },
  responses: {
    "200": {
      description: "Webhook received successfully",
    },
  },
};
