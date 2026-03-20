import type { ZodOpenApiOperationObject } from "zod-openapi";

import { DeleteManyServicesSchema } from "./delete-many-services.interactor";

import { CommonApiResponses } from "@/core/api/interactor-handler";

export const deleteManyServicesOperation: ZodOpenApiOperationObject = {
  operationId: "deleteManyServices",
  summary: "Delete many services",
  description: "Deletes many services by their IDs in a single request. This operation cannot be undone.",
  tags: ["services"],
  security: [{ apiKeyAuth: [] }],
  requestBody: {
    content: {
      "application/json": {
        schema: DeleteManyServicesSchema,
      },
    },
  },
  responses: {
    "200": {
      description: "The services were deleted successfully.",
      content: {
        "application/json": {
          schema: DeleteManyServicesSchema.shape.ids,
        },
      },
    },
    ...CommonApiResponses,
  },
};
