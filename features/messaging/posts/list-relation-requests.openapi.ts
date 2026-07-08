import type { ZodOpenApiOperationObject } from "zod-openapi";

import { ListRelationRequestsSchema } from "@/ee/messaging/posts/list-relation-requests.interactor";
import { RelationRequestListSchema } from "@/ee/messaging/posts/social-posts.schema";
import { CommonApiResponses } from "@/core/api/interactor-handler";

export const listRelationRequestsOperation: ZodOpenApiOperationObject = {
  operationId: "listRelationRequests",
  summary: "List received relation requests",
  description:
    "Lists the connection / relation requests received by the owner of a connected LinkedIn or Instagram account. Requires a connected LinkedIn or Instagram account.",
  tags: ["messaging"],
  security: [{ apiKeyAuth: [] }],
  requestBody: {
    content: {
      "application/json": {
        schema: ListRelationRequestsSchema,
      },
    },
  },
  responses: {
    "200": {
      description: "A page of received relation requests.",
      content: {
        "application/json": {
          schema: RelationRequestListSchema,
        },
      },
    },
    ...CommonApiResponses,
  },
};
