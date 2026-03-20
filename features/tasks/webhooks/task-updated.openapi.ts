import type { ZodOpenApiOperationObject } from "zod-openapi";

import z from "zod";

import { TaskDtoSchema } from "../task.schema";

import { CustomFieldValueSchema, UserReferenceSchema } from "@/core/base/base-entity.schema";

const TaskChangesSchema = z.object({
  name: z
    .object({
      previous: z.string(),
      current: z.string(),
    })
    .optional(),
  createdAt: z
    .object({
      previous: z.date(),
      current: z.date(),
    })
    .optional(),
  updatedAt: z
    .object({
      previous: z.date(),
      current: z.date(),
    })
    .optional(),
  users: z
    .object({
      previous: z.array(UserReferenceSchema),
      current: z.array(UserReferenceSchema),
    })
    .optional(),
  customFieldValues: z
    .object({
      previous: z.array(CustomFieldValueSchema),
      current: z.array(CustomFieldValueSchema),
    })
    .optional(),
});

export const WebhookTaskUpdatedSchema = z.object({
  event: z.literal("task.updated"),
  data: z.object({
    userId: z.uuid(),
    companyId: z.uuid(),
    entityId: z.uuid(),
    payload: z.object({
      task: TaskDtoSchema,
      changes: TaskChangesSchema,
    }),
  }),
  timestamp: z.date(),
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
