import type { ZodOpenApiOperationObject } from "zod-openapi";

import { z } from "zod";

import { BaseSendChatMessageSchema } from "@/ee/messaging/outbound/send-chat-message.interactor";
import { SentMessageReceiptSchema, SentMessageSchema } from "@/ee/messaging/outbound/sent-message.schema";
import {
  CommonApiResponses,
  MessagingProviderApiResponses,
  NotFoundApiResponse,
} from "@/core/api/structured-interactor-handler";

export const sendChatMessageOperation: ZodOpenApiOperationObject = {
  operationId: "sendChatMessage",
  summary: "Send a chat message",
  description:
    "Sends a real message into an existing chat thread (LinkedIn, WhatsApp, etc.). This delivers a real message as a side effect. When delivering a saved draft, pass both draftMessageId and its opaque draftRevision so a newer edit cannot be consumed. The id may also be a conversation that exists only as a saved draft; the chat is then started with the draft's recipients. Each draft revision is sent at most once: repeating the request returns the first result with repeated true and sends nothing. A draft that cannot be sent answers 409 conflict, sends nothing and names the reason in customCode: draftChanged when the draft was saved again after this draftRevision; draftTargetMismatch when the draft belongs to another conversation or account; draftSendInProgress while an earlier send of this draft is still running, which counts as draftSendOutcomeUnknown after five minutes; draftSendOutcomeUnknown when an earlier send could not be confirmed and may have been delivered, so the draft is sent again only after an edit changes its content; draftAlreadySent when this draft was already sent and the request carries other content or another draftRevision. An unknown thread answers 404 not_found, and a draft that no longer exists and was never sent answers 404 with customCode draftMessageNotFound.",
  tags: ["messaging"],
  security: [{ apiKeyAuth: [] }],
  requestParams: { path: z.object({ id: z.uuid() }) },
  requestBody: {
    required: true,
    content: {
      "application/json": {
        schema: BaseSendChatMessageSchema.omit({ threadId: true }),
      },
    },
  },
  responses: {
    "201": {
      description:
        "The provider accepted the message and it is recorded. Returns the recorded message; repeated is true when an earlier send of this draft revision is answered.",
      content: {
        "application/json": {
          schema: SentMessageSchema,
        },
      },
    },
    "202": {
      description:
        "The provider accepted the message, but it is not recorded yet. threadId is the chat when known. Also answered for a repeat while the message is still not recorded (repeated true).",
      content: {
        "application/json": {
          schema: SentMessageReceiptSchema,
        },
      },
    },
    ...CommonApiResponses,
    ...NotFoundApiResponse,
    ...MessagingProviderApiResponses,
  },
};
