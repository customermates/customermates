import type { ZodOpenApiOperationObject } from "zod-openapi";

import { GetConfigurationSchema } from "@/core/base/base-get.schema";
import { CommonApiResponses } from "@/core/api/interactor-handler";

export const getTasksConfigurationOperation: ZodOpenApiOperationObject = {
  operationId: "getTaskConfiguration",
  summary: "Get tasks configuration",
  description:
    "Retrieves configuration for tasks API, including available custom columns, filterable fields, and sortable fields.",
  tags: ["tasks"],
  security: [{ apiKeyAuth: [] }],
  responses: {
    "200": {
      description: "The tasks configuration was retrieved successfully.",
      content: {
        "application/json": {
          schema: GetConfigurationSchema,
        },
      },
    },
    ...CommonApiResponses,
  },
};
