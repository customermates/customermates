import type { ZodOpenApiOperationObject } from "zod-openapi";

import { z } from "zod";

import { TaskDtoSchema } from "../task.schema";

import { BaseUpdateTaskSchema } from "./update-task-base.schema";

import { CommonApiResponses } from "@/core/api/interactor-handler";

export const updateTaskOperation: ZodOpenApiOperationObject = {
  operationId: "updateTask",
  summary: "Update a task",
  description: "Updates an existing task. Only provided fields are updated. Set fields to null to clear them.",
  tags: ["tasks"],
  security: [{ apiKeyAuth: [] }],
  requestParams: { path: z.object({ id: z.uuid() }) },
  requestBody: {
    content: {
      "application/json": {
        schema: BaseUpdateTaskSchema.omit({ id: true }),
      },
    },
  },
  responses: {
    "200": {
      description: "The task was updated successfully.",
      content: {
        "application/json": {
          schema: TaskDtoSchema,
        },
      },
    },
    ...CommonApiResponses,
  },
};
