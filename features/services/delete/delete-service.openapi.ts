import type { ZodOpenApiOperationObject } from "zod-openapi";

import { z } from "zod";

import { DeleteServiceSchema } from "./delete-service.interactor";

import { CommonApiResponses } from "@/core/api/interactor-handler";

export const deleteServiceOperation: ZodOpenApiOperationObject = {
  operationId: "deleteService",
  summary: "Delete a service",
  description: "Deletes a service from the database.",
  tags: ["services"],
  security: [{ apiKeyAuth: [] }],
  requestParams: {
    path: DeleteServiceSchema,
  },
  responses: {
    "200": {
      description: "The service was deleted successfully.",
      content: {
        "application/json": {
          schema: z.string(),
        },
      },
    },
    ...CommonApiResponses,
  },
};
