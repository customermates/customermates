import type { ZodOpenApiOperationObject } from "zod-openapi";

import { DeleteManyDealsSchema } from "./delete-many-deals.interactor";

import { CommonApiResponses } from "@/core/api/interactor-handler";

export const deleteManyDealsOperation: ZodOpenApiOperationObject = {
  operationId: "deleteManyDeals",
  summary: "Delete many deals",
  description: "Deletes many deals by their IDs in a single request. This operation cannot be undone.",
  tags: ["deals"],
  security: [{ apiKeyAuth: [] }],
  requestBody: {
    content: {
      "application/json": {
        schema: DeleteManyDealsSchema,
      },
    },
  },
  responses: {
    "200": {
      description: "The deals were deleted successfully.",
      content: {
        "application/json": {
          schema: DeleteManyDealsSchema.shape.ids,
        },
      },
    },
    ...CommonApiResponses,
  },
};
