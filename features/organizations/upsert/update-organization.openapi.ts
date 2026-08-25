import type { ZodOpenApiOperationObject } from "zod-openapi";

import { z } from "zod";

import { OrganizationDtoSchema } from "../organization.schema";

import { BaseUpdateOrganizationSchema } from "./update-organization-base.schema";

import { CommonApiResponses } from "@/core/api/interactor-handler";

export const updateOrganizationOperation: ZodOpenApiOperationObject = {
  operationId: "updateOrganization",
  summary: "Update an organization",
  description: "Updates an existing organization. Only provided fields are updated. Set fields to null to clear them.",
  tags: ["organizations"],
  security: [{ apiKeyAuth: [] }],
  requestParams: { path: z.object({ id: z.uuid() }) },
  requestBody: {
    required: true,
    content: {
      "application/json": {
        schema: BaseUpdateOrganizationSchema.omit({ id: true }),
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
