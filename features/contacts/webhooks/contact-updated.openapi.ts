import type { ZodOpenApiOperationObject } from "zod-openapi";

import z from "zod";

import { ContactDtoSchema } from "@/features/contacts/contact.schema";
import { changesSchema } from "@/core/openapi/changes-schema";

export const WebhookContactUpdatedSchema = z.object({
  event: z.literal("contact.updated"),
  data: z.object({
    userId: z.uuid(),
    companyId: z.uuid(),
    entityId: z.uuid(),
    payload: z.object({
      contact: ContactDtoSchema,
      changes: changesSchema(ContactDtoSchema.shape),
    }),
  }),
  timestamp: z.iso.datetime(),
});

export const webhookContactUpdatedOperation: ZodOpenApiOperationObject = {
  operationId: "webhookContactUpdated",
  summary: "Contact Updated",
  description: "Sent when a contact is updated.",
  tags: ["webhooks"],
  requestBody: {
    content: {
      "application/json": {
        schema: WebhookContactUpdatedSchema,
      },
    },
  },
  responses: {
    "200": {
      description: "Webhook received successfully",
    },
  },
};
