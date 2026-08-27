import type { ZodOpenApiOperationObject } from "zod-openapi";

import { AcceptRelationRequestSchema } from "@/ee/messaging/posts/accept-relation-request.interactor";
import { RelationRequestResultSchema } from "@/ee/messaging/posts/social-posts.schema";
import { CommonApiResponses } from "@/core/api/interactor-handler";

export const acceptRelationRequestOperation: ZodOpenApiOperationObject = {
  operationId: "acceptRelationRequest",
  summary: "Accept a relation request",
  description:
    "Accepts a received relation request by invitationId on a connected LinkedIn or Instagram account. Requires a connected LinkedIn or Instagram account.",
  tags: ["messaging"],
  security: [{ apiKeyAuth: [] }],
  requestBody: {
    required: true,
    content: {
      "application/json": {
        schema: AcceptRelationRequestSchema,
      },
    },
  },
  responses: {
    "200": {
      description: "The accepted relation request.",
      content: {
        "application/json": {
          schema: RelationRequestResultSchema,
        },
      },
    },
    ...CommonApiResponses,
  },
};
