import type { ZodOpenApiOperationObject } from "zod-openapi";

import { DeleteManyOrganizationsSchema } from "./delete-many-organizations.interactor";

import { CommonApiResponses } from "@/core/api/interactor-handler";

export const deleteManyOrganizationsOperation: ZodOpenApiOperationObject = {
  operationId: "deleteManyOrganizations",
  summary: "Delete many organizations",
  description: "Deletes many organizations by their IDs in a single request. This operation cannot be undone.",
  tags: ["organizations"],
  security: [{ apiKeyAuth: [] }],
  requestBody: {
    content: {
      "application/json": {
        schema: DeleteManyOrganizationsSchema,
      },
    },
  },
  responses: {
    "200": {
      description: "The organizations were deleted successfully.",
      content: {
        "application/json": {
          schema: DeleteManyOrganizationsSchema.shape.ids,
        },
      },
    },
    ...CommonApiResponses,
  },
};
