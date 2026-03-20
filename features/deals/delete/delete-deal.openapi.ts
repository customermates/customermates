import type { ZodOpenApiOperationObject } from "zod-openapi";

import { z } from "zod";

import { DeleteDealSchema } from "./delete-deal.interactor";

import { CommonApiResponses } from "@/core/api/interactor-handler";

export const deleteDealOperation: ZodOpenApiOperationObject = {
  operationId: "deleteDeal",
  summary: "Delete a deal",
  description: "Deletes a deal from the database.",
  tags: ["deals"],
  security: [{ apiKeyAuth: [] }],
  requestParams: {
    path: DeleteDealSchema,
  },
  responses: {
    "200": {
      description: "The deal was deleted successfully.",
      content: {
        "application/json": {
          schema: z.string(),
        },
      },
    },
    ...CommonApiResponses,
  },
};
