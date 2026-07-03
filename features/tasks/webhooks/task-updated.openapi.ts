import type { ZodOpenApiOperationObject } from "zod-openapi";

import z from "zod";

import { TaskDtoSchema } from "../task.schema";
import { changesSchema } from "@/core/openapi/changes-schema";

export const WebhookTaskUpdatedSchema = z.object({
  event: z.literal("task.updated"),
  data: z.object({
    userId: z.uuid(),
    companyId: z.uuid(),
    entityId: z.uuid(),
    payload: z.object({
      task: TaskDtoSchema,
      changes: changesSchema(TaskDtoSchema.shape),
    }),
  }),
  timestamp: z.iso.datetime(),
});

export const webhookTaskUpdatedOperation: ZodOpenApiOperationObject = {
  operationId: "webhookTaskUpdated",
  summary: "Task Updated",
  description: "Sent when a task is updated.",
  tags: ["webhooks"],
  requestBody: {
    content: {
      "application/json": {
        schema: WebhookTaskUpdatedSchema,
      },
    },
  },
  responses: {
    "200": {
      description: "Webhook received successfully",
    },
  },
};
