import type { ZodOpenApiOperationObject } from "zod-openapi";

import { LinkedinSearchSalesNavigatorSchema } from "@/ee/messaging/sales-navigator/linkedin-search-sales-navigator.interactor";
import { SalesListItemPageSchema } from "@/ee/messaging/sales-navigator/sales-navigator.schema";
import { CommonApiResponses } from "@/core/api/interactor-handler";

export const searchSalesNavigatorOperation: ZodOpenApiOperationObject = {
  operationId: "searchSalesNavigator",
  summary: "Run a Sales Navigator search from a URL",
  description:
    "Executes a LinkedIn Sales Navigator search from a pasted search URL through a connected LinkedIn account and returns the result rows page by page (offset pagination). Requires the connected account to have a Sales Navigator subscription.",
  tags: ["messaging"],
  security: [{ apiKeyAuth: [] }],
  requestBody: {
    content: {
      "application/json": {
        schema: LinkedinSearchSalesNavigatorSchema,
      },
    },
  },
  responses: {
    "200": {
      description: "A page of Sales Navigator search results.",
      content: {
        "application/json": {
          schema: SalesListItemPageSchema,
        },
      },
    },
    ...CommonApiResponses,
  },
};
