import type { ZodOpenApiOperationObject } from "zod-openapi";

import { DeleteManyContactsSchema } from "./delete-many-contacts.interactor";

import { CommonApiResponses } from "@/core/api/interactor-handler";

export const deleteManyContactsOperation: ZodOpenApiOperationObject = {
  operationId: "deleteManyContacts",
  summary: "Delete many contacts",
  description: "Deletes many contacts by their IDs in a single request. This operation cannot be undone.",
  tags: ["contacts"],
  security: [{ apiKeyAuth: [] }],
  requestBody: {
    content: {
      "application/json": {
        schema: DeleteManyContactsSchema,
      },
    },
  },
  responses: {
    "200": {
      description: "The contacts were deleted successfully.",
      content: {
        "application/json": {
          schema: DeleteManyContactsSchema.shape.ids,
        },
      },
    },
    ...CommonApiResponses,
  },
};
