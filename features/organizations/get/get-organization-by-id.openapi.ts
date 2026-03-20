import type { ZodOpenApiOperationObject } from "zod-openapi";

import { z } from "zod";

import { OrganizationDtoSchema } from "../organization.schema";

import { GetOrganizationByIdSchema } from "./get-organization-by-id.interactor";

import { CommonApiResponses } from "@/core/api/interactor-handler";
import { CustomColumnDtoSchema } from "@/features/custom-column/custom-column.schema";

export const getOrganizationByIdOperation: ZodOpenApiOperationObject = {
  operationId: "getOrganizationById",
  summary: "Get an organization by ID",
  description: "Retrieves a single organization by its unique identifier.",
  tags: ["organizations"],
  security: [{ apiKeyAuth: [] }],
  requestParams: {
    path: GetOrganizationByIdSchema,
  },
  responses: {
    "200": {
      description: "The organization was retrieved successfully.",
      content: {
        "application/json": {
          schema: z.object({
            organization: OrganizationDtoSchema.nullable(),
            customColumns: z.array(CustomColumnDtoSchema),
          }),
        },
      },
    },
    ...CommonApiResponses,
  },
};
