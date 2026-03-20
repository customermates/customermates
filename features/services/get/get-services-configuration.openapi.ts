import type { ZodOpenApiOperationObject } from "zod-openapi";

import { GetConfigurationSchema } from "@/core/base/base-get.schema";
import { CommonApiResponses } from "@/core/api/interactor-handler";

export const getServicesConfigurationOperation: ZodOpenApiOperationObject = {
  operationId: "getServiceConfiguration",
  summary: "Get services configuration",
  description:
    "Retrieves configuration for services API, including available custom columns, filterable fields, and sortable fields.",
  tags: ["services"],
  security: [{ apiKeyAuth: [] }],
  responses: {
    "200": {
      description: "The services configuration was retrieved successfully.",
      content: {
        "application/json": {
          schema: GetConfigurationSchema,
        },
      },
    },
    ...CommonApiResponses,
  },
};
