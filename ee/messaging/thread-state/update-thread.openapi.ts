import type { ZodOpenApiOperationObject } from "zod-openapi";

import { z } from "zod";

import { StructuredApiResponses } from "@/core/api/structured-interactor-handler";

import { UpdateThreadStateSchema } from "./update-thread.interactor";

const THREAD_ID = "6f1e2d3c-4b5a-4968-8776-5a4b3c2d1e0f";

export const updateMessagingThreadStateOperation: ZodOpenApiOperationObject = {
  operationId: "updateMessagingThreadState",
  summary: "Set a conversation's state",
  description:
    "Sets the state of one conversation in the Customermates inbox, as the Inbox and the MCP update_messaging_thread tool do: unread, open (read), closed or spam. The state shows as a badge and is filterable in the inbox; it never hides or deletes anything, and the provider mailbox, the messages and linked records stay untouched. Setting the state a conversation already has changes nothing. Only state can be set here; any other field answers 400. A conversation you cannot see answers 404. Requires: Inbox messages Edit and a plan that includes messaging.",
  tags: ["messaging"],
  security: [{ apiKeyAuth: [] }],
  requestParams: {
    path: z.object({ id: z.uuid().describe("The conversation id from POST /v1/messaging/threads/search.") }),
  },
  requestBody: {
    required: true,
    content: {
      "application/json": {
        schema: UpdateThreadStateSchema.omit({ threadId: true }).strict(),
        example: { state: "closed" },
      },
    },
  },
  responses: {
    "200": {
      description: "The conversation and its state.",
      content: {
        "application/json": {
          schema: UpdateThreadStateSchema.strict(),
          example: { threadId: THREAD_ID, state: "closed" },
        },
      },
    },
    ...StructuredApiResponses,
  },
};
