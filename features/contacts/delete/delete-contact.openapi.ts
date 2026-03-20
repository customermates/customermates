import type { ZodOpenApiOperationObject } from "zod-openapi";

import { z } from "zod";

import { DeleteContactSchema } from "./delete-contact.interactor";

import { CommonApiResponses } from "@/core/api/interactor-handler";

export const deleteContactOperation: ZodOpenApiOperationObject = {
  operationId: "deleteContact",
  summary: "Delete a contact",
  description: "Deletes a contact from the database.",
  tags: ["contacts"],
  security: [{ apiKeyAuth: [] }],
  requestParams: {
    path: DeleteContactSchema,
  },
  responses: {
    "200": {
      description: "The contact was deleted successfully.",
      content: {
        "application/json": {
          schema: z.string(),
        },
      },
    },
    ...CommonApiResponses,
  },
};
