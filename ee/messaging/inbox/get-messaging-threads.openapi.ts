import type { ZodOpenApiOperationObject } from "zod-openapi";

import { MessagingThreadSchema } from "@/ee/messaging/messaging.schema";

import { GetQueryParamsApiSchema, createGetResultSchema } from "@/core/base/base-get.schema";
import { CommonApiResponses } from "@/core/api/interactor-handler";

export const getMessagingThreadsOperation: ZodOpenApiOperationObject = {
  operationId: "getMessagingThreads",
  summary: "Get messaging threads",
  description: "Retrieves a list of inbox message threads with optional search, sorting, and pagination.",
  tags: ["messaging"],
  security: [{ apiKeyAuth: [] }],
  requestBody: {
    required: true,
    content: {
      "application/json": {
        schema: GetQueryParamsApiSchema,
      },
    },
  },
  responses: {
    "200": {
      description: "The messaging threads were retrieved successfully.",
      content: {
        "application/json": {
          schema: createGetResultSchema(MessagingThreadSchema),
        },
      },
    },
    ...CommonApiResponses,
  },
};
