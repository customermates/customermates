import type { ZodOpenApiOperationObject } from "zod-openapi";

import { z } from "zod";

import { OrganizationDtoSchema } from "../organization.schema";

import { GetQueryParamsApiSchema, GetResultSchema } from "@/core/base/base-get.schema";
import { CommonApiResponses } from "@/core/api/interactor-handler";

export const getOrganizationsOperation: ZodOpenApiOperationObject = {
  operationId: "getOrganizations",
  summary: "Get organizations",
  description: "Retrieves a list of organizations with optional filtering, sorting, and pagination.",
  tags: ["organizations"],
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
      description: "The organizations were retrieved successfully.",
      content: {
        "application/json": {
          schema: GetResultSchema.extend({
            items: z.array(OrganizationDtoSchema),
          }),
        },
      },
    },
    ...CommonApiResponses,
  },
};
