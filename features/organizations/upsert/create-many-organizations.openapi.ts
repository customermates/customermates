import type { ZodOpenApiOperationObject } from "zod-openapi";

import { OrganizationDtoSchema } from "../organization.schema";

import { CreateManyOrganizationsSchema } from "./create-many-organizations.interactor";

import { CommonApiResponses } from "@/core/api/interactor-handler";

export const createManyOrganizationsOperation: ZodOpenApiOperationObject = {
  operationId: "createManyOrganizations",
  summary: "Create many organizations",
  description:
    "Creates many organizations in a single request. Each organization requires a name. All other fields are optional.",
  tags: ["organizations"],
  security: [{ apiKeyAuth: [] }],
  requestBody: {
    content: {
      "application/json": {
        schema: CreateManyOrganizationsSchema,
      },
    },
  },
  responses: {
    "201": {
      description: "The organizations were created successfully.",
      content: {
        "application/json": {
          schema: OrganizationDtoSchema.array(),
        },
      },
    },
    ...CommonApiResponses,
  },
};
