import type { ZodOpenApiOperationObject } from "zod-openapi";

import { TaskDtoSchema } from "../task.schema";

import { UpdateTaskSchema } from "./update-task.interactor";

import { CommonApiResponses } from "@/core/api/interactor-handler";

export const updateTaskOperation: ZodOpenApiOperationObject = {
  operationId: "updateTask",
  summary: "Update a task",
  description: "Updates an existing task. Only provided fields are updated. Set fields to null to clear them.",
  tags: ["tasks"],
  security: [{ apiKeyAuth: [] }],
  parameters: [
    {
      name: "id",
      in: "path",
      required: true,
      schema: {
        type: "string",
        format: "uuid",
      },
    },
  ],
  requestBody: {
    content: {
      "application/json": {
        schema: UpdateTaskSchema.omit({ id: true }),
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
