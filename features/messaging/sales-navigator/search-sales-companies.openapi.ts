import type { ZodOpenApiOperationObject } from "zod-openapi";

import { SearchSalesCompaniesSchema } from "@/ee/messaging/sales-navigator/search-sales-companies.interactor";
import { SalesCompanyPageSchema } from "@/ee/messaging/sales-navigator/sales-navigator.schema";
import { CommonApiResponses } from "@/core/api/interactor-handler";

export const searchSalesCompaniesOperation: ZodOpenApiOperationObject = {
  operationId: "searchSalesCompanies",
  summary: "Search Sales Navigator companies (accounts)",
  description:
    "Runs a structured LinkedIn Sales Navigator company search through a connected LinkedIn account. Filters take parameter ids resolved via the search-parameters endpoint (location, industry, account lists) plus native ranges like headcount, annual revenue and spotlights. Returns company rows page by page (offset pagination, LinkedIn caps a single company search at 1000 results). Requires the connected account to have a Sales Navigator subscription.",
  tags: ["messaging"],
  security: [{ apiKeyAuth: [] }],
  requestBody: {
    content: {
      "application/json": {
        schema: SearchSalesCompaniesSchema,
      },
    },
  },
  responses: {
    "200": {
      description: "A page of Sales Navigator company search results.",
      content: {
        "application/json": {
          schema: SalesCompanyPageSchema,
        },
      },
    },
    ...CommonApiResponses,
  },
};
