import type { ZodOpenApiOperationObject } from "zod-openapi";

import { CancelRelationRequestSchema } from "@/ee/messaging/posts/cancel-relation-request.interactor";
import { RelationRequestResultSchema } from "@/ee/messaging/posts/social-posts.schema";
import { CommonApiResponses } from "@/core/api/interactor-handler";

export const cancelRelationRequestOperation: ZodOpenApiOperationObject = {
  operationId: "cancelRelationRequest",
  summary: "Cancel a relation request",
  description:
    "Withdraws or refuses a relation request by invitationId on a connected LinkedIn or Instagram account. Requires a connected LinkedIn or Instagram account.",
  tags: ["messaging"],
  security: [{ apiKeyAuth: [] }],
  requestBody: {
    content: {
      "application/json": {
        schema: CancelRelationRequestSchema,
      },
    },
  },
  responses: {
    "200": {
      description: "The canceled relation request.",
      content: {
        "application/json": {
          schema: RelationRequestResultSchema,
        },
      },
    },
    ...CommonApiResponses,
  },
};
