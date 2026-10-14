import type { ZodOpenApiOperationObject } from "zod-openapi";

import { z } from "zod";

import { StructuredApiResponses } from "@/core/api/structured-interactor-handler";

import { MoveEmailThreadResultSchema, MoveEmailThreadSchema } from "./move-email-thread.interactor";

const THREAD_ID = "6f1e2d3c-4b5a-4968-8776-5a4b3c2d1e0f";

const MoveEmailThreadApiSchema = MoveEmailThreadSchema.omit({ threadId: true }).extend({
  folderId: MoveEmailThreadSchema.shape.folderId.describe(
    "Target folder id from folderContext.folders of the conversation; never a folder name.",
  ),
});

export const moveEmailThreadOperation: ZodOpenApiOperationObject = {
  operationId: "moveEmailThread",
  summary: "Move an email conversation to a folder",
  description:
    "Moves the eligible emails of one email conversation to a folder of its mailbox at the provider, as the Inbox and the MCP move_email_thread tool do. Take folderId from folderContext.folders of `GET /v1/messaging/threads/{id}`, which can move when folderContext.canMove is true; Sent and Drafts are never targets and their emails stay in place. Pass messageId to move a single email of the conversation. Emails moved outside the synced folders leave the inbox (hiddenFromInbox). movedCount, skippedCount and failedCount report each email; when the provider rate-limits a move part way, rateLimited and retryAfter say when to move the rest. A conversation you cannot see answers 404, an unknown folder or message 404, and a conversation that is not email 400. Requires: Inbox messages Edit and a plan that includes messaging.",
  tags: ["messaging"],
  security: [{ apiKeyAuth: [] }],
  requestParams: { path: z.object({ id: z.uuid().describe("The email conversation id.") }) },
  requestBody: {
    required: true,
    content: {
      "application/json": {
        schema: MoveEmailThreadApiSchema,
        example: { folderId: "archive" },
      },
    },
  },
  responses: {
    "200": {
      description: "How many emails were moved.",
      content: {
        "application/json": {
          schema: MoveEmailThreadResultSchema,
          example: {
            threadId: THREAD_ID,
            folderId: "archive",
            folderName: "Archive",
            movedCount: 2,
            skippedCount: 0,
            failedCount: 0,
            hiddenFromInbox: true,
            rateLimited: false,
          },
        },
      },
    },
    ...StructuredApiResponses,
  },
};
