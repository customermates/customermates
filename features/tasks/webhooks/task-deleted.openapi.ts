import type { ZodOpenApiOperationObject } from "zod-openapi";

import z from "zod";

import { TaskDtoSchema } from "../task.schema";

export const WebhookTaskDeletedSchema = z.object({
  event: z.literal("task.deleted"),
  data: z.object({
    userId: z.uuid(),
    companyId: z.uuid(),
    entityId: z.uuid(),
    payload: TaskDtoSchema,
  }),
  timestamp: z.date(),
});

export const webhookTaskDeletedOperation: ZodOpenApiOperationObject = {
  operationId: "webhookTaskDeleted",
  summary: "Task Deleted",
  description: "Sent when a task is deleted.",
  tags: ["webhooks"],
  requestBody: {
    content: {
      "application/json": {
        schema: WebhookTaskDeletedSchema,
      },
    },
  },
  responses: {
    "200": {
      description: "Webhook received successfully",
    },
  },
};
