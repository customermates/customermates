import type { ZodOpenApiOperationObject } from "zod-openapi";

import z from "zod";

import { ContactDtoSchema } from "@/features/contacts/contact.schema";

export const WebhookContactDeletedSchema = z.object({
  event: z.literal("contact.deleted"),
  data: z.object({
    userId: z.uuid(),
    companyId: z.uuid(),
    entityId: z.uuid(),
    payload: ContactDtoSchema,
  }),
  timestamp: z.date(),
});

export const webhookContactDeletedOperation: ZodOpenApiOperationObject = {
  operationId: "webhookContactDeleted",
  summary: "Contact Deleted",
  description: "Sent when a contact is deleted.",
  tags: ["webhooks"],
  requestBody: {
    content: {
      "application/json": {
        schema: WebhookContactDeletedSchema,
      },
    },
  },
  responses: {
    "200": {
      description: "Webhook received successfully",
    },
  },
};
