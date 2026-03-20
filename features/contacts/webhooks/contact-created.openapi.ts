import type { ZodOpenApiOperationObject } from "zod-openapi";

import z from "zod";

import { ContactDtoSchema } from "@/features/contacts/contact.schema";

export const WebhookContactCreatedSchema = z.object({
  event: z.literal("contact.created"),
  data: z.object({
    userId: z.uuid(),
    companyId: z.uuid(),
    entityId: z.uuid(),
    payload: ContactDtoSchema,
  }),
  timestamp: z.date(),
});

export const webhookContactCreatedOperation: ZodOpenApiOperationObject = {
  operationId: "webhookContactCreated",
  summary: "Contact Created",
  description: "Sent when a contact is created.",
  tags: ["webhooks"],
  requestBody: {
    content: {
      "application/json": {
        schema: WebhookContactCreatedSchema,
      },
    },
  },
  responses: {
    "200": {
      description: "Webhook received successfully",
    },
  },
};
