import type { ZodOpenApiOperationObject } from "zod-openapi";

import { z } from "zod";

import { ServiceDtoSchema } from "../service.schema";

import { GetQueryParamsApiSchema, GetResultSchema } from "@/core/base/base-get.schema";
import { CommonApiResponses } from "@/core/api/interactor-handler";

export const getServicesOperation: ZodOpenApiOperationObject = {
  operationId: "getServices",
  summary: "Get services",
  description: "Retrieves a list of services with optional filtering, sorting, and pagination.",
  tags: ["services"],
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
      description: "The services were retrieved successfully.",
      content: {
        "application/json": {
          schema: GetResultSchema.extend({
            items: z.array(ServiceDtoSchema),
          }),
        },
      },
    },
    ...CommonApiResponses,
  },
};
