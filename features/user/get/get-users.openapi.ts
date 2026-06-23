import type { ZodOpenApiOperationObject } from "zod-openapi";

import { z } from "zod";

import { UserDtoSchema } from "../user.schema";

import { GetQueryParamsApiSchema, PaginationResponseSchema, SortDescriptorSchema } from "@/core/base/base-get.schema";
import { CommonApiResponses } from "@/core/api/interactor-handler";

export const getUsersOperation: ZodOpenApiOperationObject = {
  operationId: "getUsers",
  summary: "Get users",
  description: "Retrieves a list of users with optional filtering, sorting and pagination.",
  tags: ["users"],
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
      description: "The users were retrieved successfully.",
      content: {
        "application/json": {
          schema: z.object({
            searchTerm: z.string().optional(),
            sortDescriptor: SortDescriptorSchema.optional(),
            pagination: PaginationResponseSchema.optional(),
            items: z.array(UserDtoSchema),
          }),
        },
      },
    },
    ...CommonApiResponses,
  },
};
