import type { ZodOpenApiOperationObject } from "zod-openapi";

import { z } from "zod";

import { StartChatInputSchema } from "@/ee/messaging/outbound/start-chat.interactor";
import { CommonApiResponses } from "@/core/api/interactor-handler";

export const startChatOperation: ZodOpenApiOperationObject = {
  operationId: "startChat",
  summary: "Start a chat",
  description:
    "Starts a new chat thread (LinkedIn, WhatsApp, etc.) with one or more attendees from a connected account and sends the first message. This delivers a real message as a side effect.",
  tags: ["messaging"],
  security: [{ apiKeyAuth: [] }],
  requestBody: {
    content: {
      "application/json": {
        schema: StartChatInputSchema,
      },
    },
  },
  responses: {
    "201": {
      description:
        "The chat was started and the first message was sent successfully. Returns the app thread id of the started chat, or null when it could not be resolved yet.",
      content: {
        "application/json": {
          schema: z.object({ threadId: z.uuid().nullable() }),
        },
      },
    },
    ...CommonApiResponses,
  },
};
