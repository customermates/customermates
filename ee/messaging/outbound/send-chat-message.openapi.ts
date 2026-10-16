import type { ZodOpenApiOperationObject } from "zod-openapi";

import { z } from "zod";

import { BaseSendChatMessageSchema } from "@/ee/messaging/outbound/send-chat-message.interactor";
import { MessagingMessageDtoSchema } from "@/ee/messaging/inbox/inbox.schema";
import { SentMessageReceiptSchema } from "@/ee/messaging/outbound/sent-message-result";
import {
  CommonApiResponses,
  ConflictApiResponse,
  MessagingProviderApiResponses,
  NotFoundApiResponse,
} from "@/core/api/structured-interactor-handler";

export const sendChatMessageOperation: ZodOpenApiOperationObject = {
  operationId: "sendChatMessage",
  summary: "Send a chat message",
  description:
    "Sends a real message into an existing chat thread (LinkedIn, WhatsApp, etc.). This delivers a real message as a side effect. When delivering a saved draft, pass both draftMessageId and its opaque draftRevision so a newer edit cannot be consumed. The id may also be a conversation that exists only as a saved draft; the chat is then started with the draft's recipients. Each draft revision is sent at most once: repeating the request answers 202 with the first result and repeated true and sends nothing. A draft that changed, whose other version was already sent, or whose earlier send is still running or could not be confirmed answers 409 and sends nothing. Compared with earlier versions of this endpoint, a send whose message is not recorded yet answers 202 with a receipt instead of 201, and a stale draftRevision answers 409 instead of 404 with customCode draftMessageNotFound.",
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
      description: "The provider accepted the message. Returns the recorded message.",
      content: {
        "application/json": {
          schema: MessagingMessageDtoSchema,
        },
      },
    },
    "202": {
      description:
        "The provider accepted the message, but it is not recorded yet, or a draft conversation started a new chat. threadId is the new chat when known. Also answered when this draft revision was already sent and nothing was sent again (repeated true).",
      content: {
        "application/json": {
          schema: SentMessageReceiptSchema,
        },
      },
    },
    ...CommonApiResponses,
    ...MessagingProviderApiResponses,
    "404": {
      ...NotFoundApiResponse["404"],
      description:
        "Not found: no thread with this id, or customCode draftMessageNotFound when the draft no longer exists and this draft revision was never sent.",
    },
    "409": {
      ...ConflictApiResponse["409"],
      description:
        "Conflict; nothing was sent. Draft conflicts carry a customCode: draftChanged when the draft was saved again after this draftRevision; draftTargetMismatch when the draft belongs to another conversation or account; draftSendInProgress while an earlier send of this draft is still running, which counts as unconfirmed (draftSendOutcomeUnknown) after five minutes; draftSendOutcomeUnknown when an earlier send could not be confirmed and may have been delivered, so the draft is sent again only after an edit changes its content; draftAlreadySent when this draft was already sent and the request carries other content or another draftRevision. Other conflicts, such as a provider rejection or a disconnected or restricted channel, carry their own customCode.",
    },
  },
};
