import type { ZodOpenApiOperationObject } from "zod-openapi";

import { DealDtoSchema } from "../deal.schema";

import { UpdateDealSchema } from "./update-deal.interactor";

import { CommonApiResponses } from "@/core/api/interactor-handler";

export const updateDealOperation: ZodOpenApiOperationObject = {
  operationId: "updateDeal",
  summary: "Update a deal",
  description: "Updates an existing deal. Only provided fields are updated. Set fields to null to clear them.",
  tags: ["deals"],
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
        schema: UpdateDealSchema.omit({ id: true }),
      },
    },
  },
  responses: {
    "200": {
      description: "The deal was updated successfully.",
      content: {
        "application/json": {
          schema: DealDtoSchema,
        },
      },
    },
    ...CommonApiResponses,
  },
};
