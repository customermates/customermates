import type { ZodOpenApiOperationObject } from "zod-openapi";

import { ListRelationRequestsSchema } from "@/ee/messaging/posts/list-relation-requests.interactor";
import { CreateRelationRequestSchema } from "@/ee/messaging/posts/create-relation-request.interactor";
import { AcceptRelationRequestSchema } from "@/ee/messaging/posts/accept-relation-request.interactor";
import { CancelRelationRequestSchema } from "@/ee/messaging/posts/cancel-relation-request.interactor";
import { RelationRequestListSchema, RelationRequestResultSchema } from "@/ee/messaging/posts/social-posts.schema";
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

export const createRelationRequestOperation: ZodOpenApiOperationObject = {
  operationId: "createRelationRequest",
  summary: "Send a relation request",
  description:
    "Sends a real connection / relation request from a connected LinkedIn or Instagram account to identifier, with an optional short message. Requires a connected LinkedIn or Instagram account.",
  tags: ["messaging"],
  security: [{ apiKeyAuth: [] }],
  requestBody: {
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

export const acceptRelationRequestOperation: ZodOpenApiOperationObject = {
  operationId: "acceptRelationRequest",
  summary: "Accept a relation request",
  description:
    "Accepts a received relation request by invitationId on a connected LinkedIn or Instagram account. Requires a connected LinkedIn or Instagram account.",
  tags: ["messaging"],
  security: [{ apiKeyAuth: [] }],
  requestBody: {
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
