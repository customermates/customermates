import type { ZodOpenApiOperationObject } from "zod-openapi";

import { UserDtoSchema } from "../user.schema";

import { GetQueryParamsApiSchema, createApiGetResultSchema } from "@/core/base/base-get.schema";
import { CommonApiResponses } from "@/core/api/structured-interactor-handler";

export const getUsersOperation: ZodOpenApiOperationObject = {
  operationId: "getUsers",
  summary: "Get users",
  description: "Retrieves a list of users with optional filtering, sorting and pagination.",
  tags: ["users"],
  security: [{ apiKeyAuth: [] }],
  requestBody: {
    required: true,
    content: {
      "application/json": {
        schema: GetQueryParamsApiSchema,
      },
    },
  },
  responses: {
    "200": {
      description: "The users were retrieved successfully.",
      content: {
        "application/json": {
          schema: createApiGetResultSchema(UserDtoSchema),
        },
      },
    },
    ...CommonApiResponses,
  },
};
