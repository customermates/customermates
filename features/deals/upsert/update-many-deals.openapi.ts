import type { ZodOpenApiOperationObject } from "zod-openapi";

import { DealDtoSchema } from "../deal.schema";

import { UpdateManyDealsSchema } from "./update-many-deals.interactor";

import { CommonApiResponses } from "@/core/api/interactor-handler";

export const updateManyDealsOperation: ZodOpenApiOperationObject = {
  operationId: "updateManyDeals",
  summary: "Update many deals",
  description:
    "Updates many deals in a single request. Each deal requires an ID. All other fields are optional. You can update services by providing a services array with serviceId and quantity.",
  tags: ["deals"],
  security: [{ apiKeyAuth: [] }],
  requestBody: {
    content: {
      "application/json": {
        schema: UpdateManyDealsSchema,
      },
    },
  },
  responses: {
    "200": {
      description: "The deals were updated successfully.",
      content: {
        "application/json": {
          schema: DealDtoSchema.array(),
        },
      },
    },
    ...CommonApiResponses,
  },
};
