import type { ZodOpenApiOperationObject } from "zod-openapi";

import { TaskDtoSchema } from "../task.schema";

import { UpdateManyTasksSchema } from "./update-many-tasks.interactor";

import { CommonApiResponses } from "@/core/api/interactor-handler";

export const updateManyTasksOperation: ZodOpenApiOperationObject = {
  operationId: "updateManyTasks",
  summary: "Update many tasks",
  description: "Updates many tasks in a single request. Each task requires an ID. All other fields are optional.",
  tags: ["tasks"],
  security: [{ apiKeyAuth: [] }],
  requestBody: {
    content: {
      "application/json": {
        schema: UpdateManyTasksSchema,
      },
    },
  },
  responses: {
    "200": {
      description: "The tasks were updated successfully.",
      content: {
        "application/json": {
          schema: TaskDtoSchema.array(),
        },
      },
    },
    ...CommonApiResponses,
  },
};
