import type { ZodOpenApiOperationObject } from "zod-openapi";

import { z } from "zod";

import { DealDtoSchema } from "../deal.schema";

import { GetDealByIdSchema } from "./get-deal-by-id.interactor";

import { CommonApiResponses } from "@/core/api/interactor-handler";
import { CustomColumnDtoSchema } from "@/features/custom-column/custom-column.schema";

export const getDealByIdOperation: ZodOpenApiOperationObject = {
  operationId: "getDealById",
  summary: "Get a deal by ID",
  description:
    "Retrieves a single deal by its unique identifier. The response carries `deal: null`, not an error, when no deal with this id is accessible.",
  tags: ["deals"],
  security: [{ apiKeyAuth: [] }],
  requestParams: {
    path: GetDealByIdSchema,
  },
  responses: {
    "200": {
      description: "The deal, or `deal: null` when no deal with this id is accessible.",
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
