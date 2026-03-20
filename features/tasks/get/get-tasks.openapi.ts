import type { ZodOpenApiOperationObject } from "zod-openapi";

import { z } from "zod";

import { TaskDtoSchema } from "../task.schema";

import { GetQueryParamsApiSchema, GetResultSchema } from "@/core/base/base-get.schema";
import { CommonApiResponses } from "@/core/api/interactor-handler";

export const getTasksOperation: ZodOpenApiOperationObject = {
  operationId: "getTasks",
  summary: "Get tasks",
  description: "Retrieves a list of tasks with optional filtering, sorting, and pagination.",
  tags: ["tasks"],
  security: [{ apiKeyAuth: [] }],
  requestBody: {
    content: {
      "application/json": {
        schema: GetQueryParamsApiSchema,
      },
    },
  },
  responses: {
    "200": {
      description: "The tasks were retrieved successfully.",
      content: {
        "application/json": {
          schema: GetResultSchema.extend({
            items: z.array(TaskDtoSchema),
          }),
        },
      },
    },
    ...CommonApiResponses,
  },
};
