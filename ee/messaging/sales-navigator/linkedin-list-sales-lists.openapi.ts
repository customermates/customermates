import type { ZodOpenApiOperationObject } from "zod-openapi";

import { LinkedinListSalesListsSchema } from "@/ee/messaging/sales-navigator/linkedin-list-sales-lists.interactor";
import { SalesListPageSchema } from "@/ee/messaging/sales-navigator/sales-navigator.schema";
import { CommonApiResponses } from "@/core/api/interactor-handler";

export const linkedinListSalesListsOperation: ZodOpenApiOperationObject = {
  operationId: "listSalesLists",
  summary: "List Sales Navigator lists",
  description:
    "Lists the Sales Navigator lead lists (kind leads, default) or account lists (kind accounts) of a connected LinkedIn account. Lists can only be created in the Sales Navigator UI; the API reads and fills existing lists.",
  tags: ["messaging"],
  security: [{ apiKeyAuth: [] }],
  requestBody: {
    content: {
      "application/json": {
        schema: LinkedinListSalesListsSchema,
      },
    },
  },
  responses: {
    "200": {
      description: "A page of Sales Navigator lists.",
      content: {
        "application/json": {
          schema: SalesListPageSchema,
        },
      },
    },
    ...CommonApiResponses,
  },
};
