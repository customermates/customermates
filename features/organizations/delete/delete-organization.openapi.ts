import type { ZodOpenApiOperationObject } from "zod-openapi";

import { z } from "zod";

import { DeleteOrganizationSchema } from "./delete-organization.interactor";

import { CommonApiResponses } from "@/core/api/interactor-handler";

export const deleteOrganizationOperation: ZodOpenApiOperationObject = {
  operationId: "deleteOrganization",
  summary: "Delete an organization",
  description: "Deletes an organization from the database.",
  tags: ["organizations"],
  security: [{ apiKeyAuth: [] }],
  requestParams: {
    path: DeleteOrganizationSchema,
  },
  responses: {
    "200": {
      description: "The organization was deleted successfully.",
      content: {
        "application/json": {
          schema: z.string(),
        },
      },
    },
    ...CommonApiResponses,
  },
};
