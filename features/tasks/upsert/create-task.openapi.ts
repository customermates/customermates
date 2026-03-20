import type { ZodOpenApiOperationObject } from "zod-openapi";

import { TaskDtoSchema } from "../task.schema";

import { CreateTaskSchema } from "./create-task.interactor";

import { CommonApiResponses } from "@/core/api/interactor-handler";

export const createTaskOperation: ZodOpenApiOperationObject = {
  operationId: "createTask",
  summary: "Create a task",
  description: "Creates a new task. Name is required. All other fields are optional.",
  tags: ["tasks"],
  security: [{ apiKeyAuth: [] }],
  requestBody: {
    content: {
      "application/json": {
        schema: CreateTaskSchema,
      },
    },
  },
  responses: {
    "201": {
      description: "The task was created successfully.",
      content: {
        "application/json": {
          schema: TaskDtoSchema,
        },
      },
    },
    ...CommonApiResponses,
  },
};
