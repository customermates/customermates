import type { ZodOpenApiOperationObject } from "zod-openapi";

import { CreateRelationRequestSchema } from "@/ee/messaging/posts/create-relation-request.interactor";
import { RelationRequestResultSchema } from "@/ee/messaging/posts/social-posts.schema";
import { CommonApiResponses } from "@/core/api/interactor-handler";

export const createRelationRequestOperation: ZodOpenApiOperationObject = {
  operationId: "createRelationRequest",
  summary: "Send a relation request",
  description:
    "Sends a real connection / relation request from a connected LinkedIn or Instagram account to identifier, with an optional short message. Requires a connected LinkedIn or Instagram account.",
  tags: ["messaging"],
  security: [{ apiKeyAuth: [] }],
  requestBody: {
    required: true,
    content: {
      "application/json": {
        schema: CreateRelationRequestSchema,
      },
    },
  },
  responses: {
    "200": {
      description: "The created relation request.",
      content: {
        "application/json": {
          schema: RelationRequestResultSchema,
        },
      },
    },
    ...CommonApiResponses,
  },
};
