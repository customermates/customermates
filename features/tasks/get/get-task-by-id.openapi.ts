import type { ZodOpenApiOperationObject } from "zod-openapi";

import { z } from "zod";

import { TaskDtoSchema } from "../task.schema";

import { GetTaskByIdSchema } from "./get-task-by-id.interactor";

import { CommonApiResponses } from "@/core/api/interactor-handler";
import { CustomColumnDtoSchema } from "@/features/custom-column/custom-column.schema";

export const getTaskByIdOperation: ZodOpenApiOperationObject = {
  operationId: "getTaskById",
  summary: "Get a task by ID",
  description:
    "Retrieves a single task by its unique identifier. The response carries `task: null`, not an error, when no task with this id is accessible.",
  tags: ["tasks"],
  security: [{ apiKeyAuth: [] }],
  requestParams: {
    path: GetTaskByIdSchema,
  },
  responses: {
    "200": {
      description: "The task, or `task: null` when no task with this id is accessible.",
      content: {
        "application/json": {
          schema: z.object({
            task: TaskDtoSchema.nullable(),
            customColumns: z.array(CustomColumnDtoSchema),
          }),
        },
      },
    },
    ...CommonApiResponses,
  },
};
