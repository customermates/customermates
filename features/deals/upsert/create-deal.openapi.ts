import type { ZodOpenApiOperationObject } from "zod-openapi";

import { DealDtoSchema } from "../deal.schema";

import { CreateDealSchema } from "./create-deal.interactor";

import { CommonApiResponses } from "@/core/api/interactor-handler";

export const createDealOperation: ZodOpenApiOperationObject = {
  operationId: "createDeal",
  summary: "Create a deal",
  description: "Creates a new deal. Name is required. All other fields are optional.",
  tags: ["deals"],
  security: [{ apiKeyAuth: [] }],
  requestBody: {
    content: {
      "application/json": {
        schema: CreateDealSchema,
      },
    },
  },
  responses: {
    "201": {
      description: "The deal was created successfully.",
      content: {
        "application/json": {
          schema: DealDtoSchema,
        },
      },
    },
    ...CommonApiResponses,
  },
};
