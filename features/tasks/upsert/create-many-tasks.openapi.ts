import type { ZodOpenApiOperationObject } from "zod-openapi";

import { TaskDtoSchema } from "../task.schema";

import { CreateManyTasksSchema } from "./create-many-tasks.interactor";

import { CommonApiResponses } from "@/core/api/interactor-handler";

export const createManyTasksOperation: ZodOpenApiOperationObject = {
  operationId: "createManyTasks",
  summary: "Create many tasks",
  description: "Creates many tasks in a single request. Each task requires a name. All other fields are optional.",
  tags: ["tasks"],
  security: [{ apiKeyAuth: [] }],
  requestBody: {
    content: {
      "application/json": {
        schema: CreateManyTasksSchema,
      },
    },
  },
  responses: {
    "201": {
      description: "The tasks were created successfully.",
      content: {
        "application/json": {
          schema: TaskDtoSchema.array(),
        },
      },
    },
    ...CommonApiResponses,
  },
};
