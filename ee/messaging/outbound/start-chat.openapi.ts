import type { ZodOpenApiOperationObject } from "zod-openapi";

import { StartChatInputSchema } from "@/ee/messaging/outbound/start-chat.interactor";
import { SentMessageReceiptSchema } from "@/ee/messaging/outbound/sent-message.schema";
import {
  CommonApiResponses,
  MessagingProviderApiResponses,
  NotFoundApiResponse,
} from "@/core/api/structured-interactor-handler";

export const startChatOperation: ZodOpenApiOperationObject = {
  operationId: "startChat",
  summary: "Start a chat",
  description:
    "Starts a new chat thread (LinkedIn, WhatsApp, etc.) with one or more attendees from a connected account and sends the first message. This delivers a real message as a side effect. When delivering a saved draft, pass both draftMessageId and its opaque draftRevision so a newer edit cannot be consumed. Each draft revision is sent at most once: repeating the request returns the first result with repeated true and sends nothing. A draft that cannot be sent answers 409 conflict, sends nothing and names the reason in customCode: draftChanged when the draft was saved again after this draftRevision; draftRecipientsChanged when attendeeIdentifiers differ from the saved draft's recipients; draftTargetMismatch when the draft belongs to another conversation or account; draftSendInProgress while an earlier send of this draft is still running, which counts as draftSendOutcomeUnknown after five minutes; draftSendOutcomeUnknown when an earlier send could not be confirmed and may have been delivered, so the draft is sent again only after an edit changes its content; draftAlreadySent when this draft was already sent and the request carries other content or another draftRevision. A draft that no longer exists and was never sent answers 404 not_found with customCode draftMessageNotFound.",
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
        "The chat was started, the provider accepted the first message and it is recorded. Returns the app thread and message ids of the started chat; repeated is true when an earlier send of this draft revision is answered.",
      content: {
        "application/json": {
          schema: SentMessageReceiptSchema,
        },
      },
    },
    "202": {
      description:
        "The provider accepted the first message, but the started chat is not recorded yet, so threadId and messageId are null. Also answered for a repeat while the chat is still not recorded (repeated true).",
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
