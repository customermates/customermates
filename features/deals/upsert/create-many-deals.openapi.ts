import type { ZodOpenApiOperationObject } from "zod-openapi";

import { DealDtoSchema } from "../deal.schema";

import { CreateManyDealsSchema } from "./create-many-deals.interactor";

import { CommonApiResponses } from "@/core/api/interactor-handler";

export const createManyDealsOperation: ZodOpenApiOperationObject = {
  operationId: "createManyDeals",
  summary: "Create many deals",
  description:
    "Creates many deals in a single request. Each deal requires a name. All other fields are optional. Deals can include services with quantities using the services array.",
  tags: ["deals"],
  security: [{ apiKeyAuth: [] }],
  requestBody: {
    content: {
      "application/json": {
        schema: CreateManyDealsSchema,
      },
    },
  },
  responses: {
    "201": {
      description: "The deals were created successfully.",
      content: {
        "application/json": {
          schema: DealDtoSchema.array(),
        },
      },
    },
    ...CommonApiResponses,
  },
};
