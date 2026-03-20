import type { ZodOpenApiOperationObject } from "zod-openapi";

import { z } from "zod";

import { ContactDtoSchema } from "../contact.schema";

import { GetQueryParamsApiSchema, GetResultSchema } from "@/core/base/base-get.schema";
import { CommonApiResponses } from "@/core/api/interactor-handler";

export const getContactsOperation: ZodOpenApiOperationObject = {
  operationId: "getContacts",
  summary: "Get contacts",
  description: "Retrieves a list of contacts with optional filtering, sorting, and pagination.",
  tags: ["contacts"],
  security: [{ apiKeyAuth: [] }],
  requestBody: {
    content: {
      "application/json": {
        schema: GetQueryParamsApiSchema,
      },
    },
  },
  responses: {
    "200": {
      description: "The contacts were retrieved successfully.",
      content: {
        "application/json": {
          schema: GetResultSchema.extend({
            items: z.array(ContactDtoSchema),
          }),
        },
      },
    },
    ...CommonApiResponses,
  },
};
