import type { ZodOpenApiOperationObject } from "zod-openapi";

import { GetConfigurationSchema } from "@/core/base/base-get.schema";
import { CommonApiResponses } from "@/core/api/interactor-handler";

export const getContactsConfigurationOperation: ZodOpenApiOperationObject = {
  operationId: "getContactConfiguration",
  summary: "Get contacts configuration",
  description:
    "Retrieves configuration for contacts API, including available custom columns, filterable fields, and sortable fields.",
  tags: ["contacts"],
  security: [{ apiKeyAuth: [] }],
  responses: {
    "200": {
      description: "The contacts configuration was retrieved successfully.",
      content: {
        "application/json": {
          schema: GetConfigurationSchema,
        },
      },
    },
    ...CommonApiResponses,
  },
};
