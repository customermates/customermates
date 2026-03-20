import type { ZodOpenApiOperationObject } from "zod-openapi";

import { z } from "zod";

import { DealDtoSchema } from "../deal.schema";

import { GetDealByIdSchema } from "./get-deal-by-id.interactor";

import { CommonApiResponses } from "@/core/api/interactor-handler";
import { CustomColumnDtoSchema } from "@/features/custom-column/custom-column.schema";

export const getDealByIdOperation: ZodOpenApiOperationObject = {
  operationId: "getDealById",
  summary: "Get a deal by ID",
  description: "Retrieves a single deal by its unique identifier.",
  tags: ["deals"],
  security: [{ apiKeyAuth: [] }],
  requestParams: {
    path: GetDealByIdSchema,
  },
  responses: {
    "200": {
      description: "The deal was retrieved successfully.",
      content: {
        "application/json": {
          schema: z.object({
            deal: DealDtoSchema.nullable(),
            customColumns: z.array(CustomColumnDtoSchema),
          }),
        },
      },
    },
    ...CommonApiResponses,
  },
};
