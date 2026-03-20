import type { ZodOpenApiOperationObject } from "zod-openapi";

import { OrganizationDtoSchema } from "../organization.schema";

import { CreateOrganizationSchema } from "./create-organization.interactor";

import { CommonApiResponses } from "@/core/api/interactor-handler";

export const createOrganizationOperation: ZodOpenApiOperationObject = {
  operationId: "createOrganization",
  summary: "Create an organization",
  description: "Creates a new organization. Name is required. All other fields are optional.",
  tags: ["organizations"],
  security: [{ apiKeyAuth: [] }],
  requestBody: {
    content: {
      "application/json": {
        schema: CreateOrganizationSchema,
      },
    },
  },
  responses: {
    "201": {
      description: "The organization was created successfully.",
      content: {
        "application/json": {
          schema: OrganizationDtoSchema,
        },
      },
    },
    ...CommonApiResponses,
  },
};
