import type { ZodOpenApiOperationObject } from "zod-openapi";

import { OrganizationDtoSchema } from "../organization.schema";

import { UpdateOrganizationSchema } from "./update-organization.interactor";

import { CommonApiResponses } from "@/core/api/interactor-handler";

export const updateOrganizationOperation: ZodOpenApiOperationObject = {
  operationId: "updateOrganization",
  summary: "Update an organization",
  description: "Updates an existing organization. Only provided fields are updated. Set fields to null to clear them.",
  tags: ["organizations"],
  security: [{ apiKeyAuth: [] }],
  parameters: [
    {
      name: "id",
      in: "path",
      required: true,
      schema: {
        type: "string",
        format: "uuid",
      },
    },
  ],
  requestBody: {
    content: {
      "application/json": {
        schema: UpdateOrganizationSchema.omit({ id: true }),
      },
    },
  },
  responses: {
    "200": {
      description: "The organization was updated successfully.",
      content: {
        "application/json": {
          schema: OrganizationDtoSchema,
        },
      },
    },
    ...CommonApiResponses,
  },
};
