import type { ZodOpenApiOperationObject } from "zod-openapi";

import { GetConfigurationSchema } from "@/core/base/base-get.schema";
import { CommonApiResponses } from "@/core/api/interactor-handler";

export const getOrganizationsConfigurationOperation: ZodOpenApiOperationObject = {
  operationId: "getOrganizationConfiguration",
  summary: "Get organizations configuration",
  description:
    "Retrieves configuration for organizations API, including available custom columns, filterable fields, and sortable fields.",
  tags: ["organizations"],
  security: [{ apiKeyAuth: [] }],
  responses: {
    "200": {
      description: "The organizations configuration was retrieved successfully.",
      content: {
        "application/json": {
          schema: GetConfigurationSchema,
        },
      },
    },
    ...CommonApiResponses,
  },
};
