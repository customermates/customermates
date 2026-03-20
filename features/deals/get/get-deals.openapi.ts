import type { ZodOpenApiOperationObject } from "zod-openapi";

import { z } from "zod";

import { DealDtoSchema } from "../deal.schema";

import { GetQueryParamsApiSchema, GetResultSchema } from "@/core/base/base-get.schema";
import { CommonApiResponses } from "@/core/api/interactor-handler";

export const getDealsOperation: ZodOpenApiOperationObject = {
  operationId: "getDeals",
  summary: "Get deals",
  description: "Retrieves a list of deals with optional filtering, sorting, and pagination.",
  tags: ["deals"],
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
      description: "The deals were retrieved successfully.",
      content: {
        "application/json": {
          schema: GetResultSchema.extend({
            items: z.array(DealDtoSchema),
          }),
        },
      },
    },
    ...CommonApiResponses,
  },
};
