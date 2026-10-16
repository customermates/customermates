import type { ZodOpenApiOperationObject } from "zod-openapi";

import { z } from "zod";

import { StartChatInputSchema } from "@/ee/messaging/outbound/start-chat.interactor";
import {
  CommonApiResponses,
  ConflictApiResponse,
  MessagingProviderApiResponses,
  NotFoundApiResponse,
} from "@/core/api/structured-interactor-handler";

export const startChatOperation: ZodOpenApiOperationObject = {
  operationId: "startChat",
  summary: "Start a chat",
  description:
    "Starts a new chat thread (LinkedIn, WhatsApp, etc.) with one or more attendees from a connected account and sends the first message. This delivers a real message as a side effect. When delivering a saved draft, pass both draftMessageId and its opaque draftRevision so a newer edit cannot be consumed. Each draft revision is sent at most once: repeating the request returns the first result with repeated true and sends nothing. A draft that changed, whose recipients differ, whose other version was already sent, or whose earlier send is still running or could not be confirmed answers 409 and sends nothing.",
  tags: ["messaging"],
  security: [{ apiKeyAuth: [] }],
  requestBody: {
    required: true,
    content: {
      "application/json": {
        schema: StartChatInputSchema,
      },
    },
  },
  responses: {
    "201": {
      description:
        "The chat was started and the provider accepted the first message. Returns the app thread and message ids of the started chat, or null when they could not be resolved yet; repeated is true when this answers an earlier accepted send of the same draft revision.",
      content: {
        "application/json": {
          schema: z.object({
            threadId: z.uuid().nullable(),
            messageId: z.uuid().nullable(),
            repeated: z.boolean(),
          }),
        },
      },
    },
    ...CommonApiResponses,
    ...NotFoundApiResponse,
    ...ConflictApiResponse,
    ...MessagingProviderApiResponses,
  },
};
