import type { ZodOpenApiOperationObject } from "zod-openapi";

import { LinkedinSaveToSalesListSchema } from "@/ee/messaging/sales-navigator/linkedin-save-to-sales-list.interactor";
import { LinkedinSaveToSalesListResultSchema } from "@/ee/messaging/sales-navigator/sales-navigator.schema";
import { CommonApiResponses } from "@/core/api/interactor-handler";

export const saveToSalesListOperation: ZodOpenApiOperationObject = {
  operationId: "saveToSalesList",
  summary: "Save a lead or account to a Sales Navigator list",
  description:
    "Saves a person (kind leads, providerId is the LinkedIn user id) or a company (kind accounts, providerId is the LinkedIn company id) to an existing Sales Navigator list on a connected LinkedIn account. New lists must be created in the Sales Navigator UI first.",
  tags: ["messaging"],
  security: [{ apiKeyAuth: [] }],
  requestBody: {
    content: {
      "application/json": {
        schema: LinkedinSaveToSalesListSchema,
      },
    },
  },
  responses: {
    "200": {
      description: "Confirmation that the item was saved to the list.",
      content: {
        "application/json": {
          schema: LinkedinSaveToSalesListResultSchema,
        },
      },
    },
    ...CommonApiResponses,
  },
};
