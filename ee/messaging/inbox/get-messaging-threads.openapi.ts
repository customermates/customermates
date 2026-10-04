import type { ZodOpenApiOperationObject } from "zod-openapi";

import { MessagingThreadSchema } from "@/ee/messaging/messaging.schema";

import { GetQueryParamsApiSchema, createApiGetResultSchema } from "@/core/base/base-get.schema";
import { CommonApiResponses, NotFoundApiResponse } from "@/core/api/interactor-handler";

export const getMessagingThreadsOperation: ZodOpenApiOperationObject = {
  operationId: "getMessagingThreads",
  summary: "Get messaging threads",
  description:
    "Retrieves inbox threads with search, sorting, pagination and shared filter syntax. Filters include connectedAccountId, emailFolder (in/notIn), lastMessageDirection (inbound/outbound), lastMessageSentAt (last actual message date) and lastMessageAt (activity including drafts). Use caller-scoped filterableFields.options; folder values encode [account UUID, provider folder ID] as a JSON string and groupKey identifies the account heading. Folder membership matches visible placements. Last direction/date exclude drafts, hidden/deleted messages and system events. Filters combine with AND; lastMessageSentAt inLastDays 7 plus notInLastDays 3 finds messages from three to seven days ago, using the standard start-of-day cutoff.",
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
          schema: createApiGetResultSchema(MessagingThreadSchema),
        },
      },
    },
    ...CommonApiResponses,
    ...NotFoundApiResponse,
  },
};
