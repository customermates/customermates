import type { ZodOpenApiOperationObject } from "zod-openapi";

import { SearchSalesPeopleSchema } from "@/ee/messaging/sales-navigator/search-sales-people.interactor";
import { SalesListItemPageSchema } from "@/ee/messaging/sales-navigator/sales-navigator.schema";
import { CommonApiResponses } from "@/core/api/interactor-handler";

export const searchSalesPeopleOperation: ZodOpenApiOperationObject = {
  operationId: "searchSalesPeople",
  summary: "Search Sales Navigator people (leads)",
  description:
    "Runs a structured LinkedIn Sales Navigator people search through a connected LinkedIn account. Filters take parameter ids resolved via the search-parameters endpoint (location, industry, company, job title, and more) plus native enums like seniority and company headcount. Returns lead rows page by page (offset pagination, LinkedIn caps a single search at 2500 results). Requires the connected account to have a Sales Navigator subscription.",
  tags: ["messaging"],
  security: [{ apiKeyAuth: [] }],
  requestBody: {
    content: {
      "application/json": {
        schema: SearchSalesPeopleSchema,
      },
    },
  },
  responses: {
    "200": {
      description: "A page of Sales Navigator people search results.",
      content: {
        "application/json": {
          schema: SalesListItemPageSchema,
        },
      },
    },
    ...CommonApiResponses,
  },
};
