import type { ZodOpenApiOperationObject } from "zod-openapi";

import { DeleteManyTasksSchema } from "./delete-many-tasks.interactor";

import { CommonApiResponses } from "@/core/api/interactor-handler";

export const deleteManyTasksOperation: ZodOpenApiOperationObject = {
  operationId: "deleteManyTasks",
  summary: "Delete many tasks",
  description: "Deletes many tasks by their IDs in a single request. This operation cannot be undone.",
  tags: ["tasks"],
  security: [{ apiKeyAuth: [] }],
  requestBody: {
    content: {
      "application/json": {
        schema: DeleteManyTasksSchema,
      },
    },
  },
  responses: {
    "200": {
      description: "The tasks were deleted successfully.",
      content: {
        "application/json": {
          schema: DeleteManyTasksSchema.shape.ids,
        },
      },
    },
    ...CommonApiResponses,
  },
};
