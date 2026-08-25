import type { ZodOpenApiOperationObject } from "zod-openapi";

import { z } from "zod";

import { DealDtoSchema } from "../deal.schema";

import { BaseUpdateDealSchema } from "./update-deal-base.schema";

import { CommonApiResponses } from "@/core/api/interactor-handler";

export const updateDealOperation: ZodOpenApiOperationObject = {
  operationId: "updateDeal",
  summary: "Update a deal",
  description: "Updates an existing deal. Only provided fields are updated. Set fields to null to clear them.",
  tags: ["deals"],
  security: [{ apiKeyAuth: [] }],
  requestParams: { path: z.object({ id: z.uuid() }) },
  requestBody: {
    required: true,
    content: {
      "application/json": {
        schema: BaseUpdateDealSchema.omit({ id: true }),
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
