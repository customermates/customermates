import type { ZodOpenApiOperationObject } from "zod-openapi";

import { LinkedinListSalesSearchParametersSchema } from "@/ee/messaging/sales-navigator/linkedin-list-sales-search-parameters.interactor";
import { SalesSearchParameterPageSchema } from "@/ee/messaging/sales-navigator/sales-navigator.schema";
import { CommonApiResponses } from "@/core/api/interactor-handler";

export const linkedinListSalesSearchParametersOperation: ZodOpenApiOperationObject = {
  operationId: "listSalesSearchParameters",
  summary: "List Sales Navigator search parameters",
  description:
    "Resolves the parameter ids used by the Sales Navigator people and company search filters. Pass a type (LOCATION, INDUSTRY, JOB_TITLE, COMPANY, LEAD_LIST, ACCOUNT_LIST and more) and optional keywords to look up matching ids with display names. LEAD_LIST and ACCOUNT_LIST also resolve existing list ids by name.",
  tags: ["messaging"],
  security: [{ apiKeyAuth: [] }],
  requestBody: {
    content: {
      "application/json": {
        schema: LinkedinListSalesSearchParametersSchema,
      },
    },
  },
  responses: {
    "200": {
      description: "A page of search parameters (id and display name).",
      content: {
        "application/json": {
          schema: SalesSearchParameterPageSchema,
        },
      },
    },
    ...CommonApiResponses,
  },
};
