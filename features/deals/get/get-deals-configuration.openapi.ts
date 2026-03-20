import type { ZodOpenApiOperationObject } from "zod-openapi";

import { GetConfigurationSchema } from "@/core/base/base-get.schema";
import { CommonApiResponses } from "@/core/api/interactor-handler";

export const getDealsConfigurationOperation: ZodOpenApiOperationObject = {
  operationId: "getDealConfiguration",
  summary: "Get deals configuration",
  description:
    "Retrieves configuration for deals API, including available custom columns, filterable fields, and sortable fields.",
  tags: ["deals"],
  security: [{ apiKeyAuth: [] }],
  responses: {
    "200": {
      description: "The deals configuration was retrieved successfully.",
      content: {
        "application/json": {
          schema: GetConfigurationSchema,
        },
      },
    },
    ...CommonApiResponses,
  },
};
