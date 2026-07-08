import type { ZodOpenApiOperationObject } from "zod-openapi";

import { BrowseSalesListSchema } from "@/ee/messaging/sales-navigator/browse-sales-list.interactor";
import { SalesListItemPageSchema } from "@/ee/messaging/sales-navigator/sales-navigator.schema";
import { CommonApiResponses } from "@/core/api/interactor-handler";

export const browseSalesListOperation: ZodOpenApiOperationObject = {
  operationId: "browseSalesList",
  summary: "Browse a Sales Navigator list",
  description:
    "Returns the leads (kind leads, default) or accounts (kind accounts) saved in a Sales Navigator list of a connected LinkedIn account, page by page (offset pagination).",
  tags: ["messaging"],
  security: [{ apiKeyAuth: [] }],
  requestBody: {
    content: {
      "application/json": {
        schema: BrowseSalesListSchema,
      },
    },
  },
  responses: {
    "200": {
      description: "A page of list members.",
      content: {
        "application/json": {
          schema: SalesListItemPageSchema,
        },
      },
    },
    ...CommonApiResponses,
  },
};
