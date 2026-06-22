import type { ZodOpenApiOperationObject } from "zod-openapi";

import { z } from "zod";

import { GetMessagingThreadResultSchema } from "@/ee/messaging/inbox/get-messaging-thread.interactor";

import { CommonApiResponses } from "@/core/api/interactor-handler";

export const getMessagingThreadOperation: ZodOpenApiOperationObject = {
  operationId: "getMessagingThread",
  summary: "Get a messaging thread by ID",
  description:
    "Fetches one message thread with its full message list. Returns the thread plus each message's direction, sender, subject, text body, and attachment metadata (HTML bodies and raw attachment urls are omitted).",
  tags: ["messaging"],
  security: [{ apiKeyAuth: [] }],
  requestParams: { path: z.object({ id: z.uuid() }) },
  responses: {
    "200": {
      description: "The messaging thread was retrieved successfully.",
      content: {
        "application/json": {
          schema: GetMessagingThreadResultSchema,
        },
      },
    },
    ...CommonApiResponses,
  },
};
