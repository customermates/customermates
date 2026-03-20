import type { ZodOpenApiOperationObject } from "zod-openapi";

import { OrganizationDtoSchema } from "../organization.schema";

import { UpdateManyOrganizationsSchema } from "./update-many-organizations.interactor";

import { CommonApiResponses } from "@/core/api/interactor-handler";

export const updateManyOrganizationsOperation: ZodOpenApiOperationObject = {
  operationId: "updateManyOrganizations",
  summary: "Update many organizations",
  description:
    "Updates many organizations in a single request. Each organization requires an ID. All other fields are optional.",
  tags: ["organizations"],
  security: [{ apiKeyAuth: [] }],
  requestBody: {
    content: {
      "application/json": {
        schema: UpdateManyOrganizationsSchema,
      },
    },
  },
  responses: {
    "200": {
      description: "The organizations were updated successfully.",
      content: {
        "application/json": {
          schema: OrganizationDtoSchema.array(),
        },
      },
    },
    ...CommonApiResponses,
  },
};
