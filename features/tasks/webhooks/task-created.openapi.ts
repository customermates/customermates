import type { ZodOpenApiOperationObject } from "zod-openapi";

import z from "zod";

import { TaskDtoSchema } from "../task.schema";

export const WebhookTaskCreatedSchema = z.object({
  event: z.literal("task.created"),
  data: z.object({
    userId: z.uuid(),
    companyId: z.uuid(),
    entityId: z.uuid(),
    payload: TaskDtoSchema,
  }),
  timestamp: z.date(),
});

export const webhookTaskCreatedOperation: ZodOpenApiOperationObject = {
  operationId: "webhookTaskCreated",
  summary: "Task Created",
  description: "Sent when a task is created.",
  tags: ["webhooks"],
  requestBody: {
    content: {
      "application/json": {
        schema: WebhookTaskCreatedSchema,
      },
    },
  },
  responses: {
    "200": {
      description: "Webhook received successfully",
    },
  },
};
