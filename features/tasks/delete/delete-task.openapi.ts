import type { ZodOpenApiOperationObject } from "zod-openapi";

import { z } from "zod";

import { DeleteTaskSchema } from "./delete-task.interactor";

import { CommonApiResponses } from "@/core/api/interactor-handler";

export const deleteTaskOperation: ZodOpenApiOperationObject = {
  operationId: "deleteTask",
  summary: "Delete a task",
  description: "Deletes a task from the database.",
  tags: ["tasks"],
  security: [{ apiKeyAuth: [] }],
  requestParams: {
    path: DeleteTaskSchema,
  },
  responses: {
    "200": {
      description: "The task was deleted successfully.",
      content: {
        "application/json": {
          schema: z.string(),
        },
      },
    },
    ...CommonApiResponses,
  },
};
