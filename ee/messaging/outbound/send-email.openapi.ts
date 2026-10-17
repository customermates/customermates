import type { ZodOpenApiOperationObject } from "zod-openapi";

import { SendEmailSchema } from "@/ee/messaging/outbound/send-email.interactor";
import { SentMessageReceiptSchema, SentMessageSchema } from "@/ee/messaging/outbound/sent-message.schema";
import {
  CommonApiResponses,
  MessagingProviderApiResponses,
  NotFoundApiResponse,
} from "@/core/api/structured-interactor-handler";

export const sendEmailOperation: ZodOpenApiOperationObject = {
  operationId: "sendEmail",
  summary: "Send an email",
  description:
    "Sends a real email (or reply) from a connected email account. Provide either threadId (reply; takes precedence if both are given) or connectedAccountId (new email). At least one recipient is required across to, cc and bcc; use to: [] for Cc-only or Bcc-only email. cc and bcc are plain email strings, unlike `to` which uses the `{ identifier }` object form. Never promote hidden Bcc recipients into To or Cc. The connected account's enabled signature is appended automatically, and its email appearance is applied to plain-text and Markdown bodies. Explicit HTML remains caller-controlled. Set bodyFormat when the body is explicitly plain text, Markdown, or HTML. When delivering a saved draft, pass both draftMessageId and its opaque draftRevision so a newer edit cannot be consumed. threadId may also be the id of a conversation that exists only as a saved draft; it then sends that draft like connectedAccountId does. Each draft revision is sent at most once: repeating the request returns the first result with repeated true and sends nothing. A draft that cannot be sent answers 409 conflict, sends nothing and names the reason in customCode: draftChanged when the draft was saved again after this draftRevision; draftRecipientsChanged when To differs from the saved draft or a saved Bcc recipient was moved into To or Cc; draftTargetMismatch when the draft belongs to another conversation or account; draftSendInProgress while an earlier send of this draft is still running, which counts as draftSendOutcomeUnknown after five minutes; draftSendOutcomeUnknown when an earlier send could not be confirmed and may have been delivered, so the draft is sent again only after an edit changes its content, and once the sent copy of that send syncs from the mailbox the draft counts as sent; draftAlreadySent when this draft was already sent and the request carries other content or another draftRevision. A draft that no longer exists and was never sent answers 404 not_found with customCode draftMessageNotFound.",
  tags: ["messaging"],
  security: [{ apiKeyAuth: [] }],
  requestBody: {
    required: true,
    content: {
      "application/json": {
        schema: SendEmailSchema,
      },
    },
  },
  responses: {
    "200": {
      description:
        "The provider accepted the email and its sent copy is recorded. Returns the recorded message, including its thread id; repeated is true when an earlier send of this draft revision is answered.",
      content: {
        "application/json": {
          schema: SentMessageSchema,
        },
      },
    },
    "202": {
      description:
        "The provider accepted the email, but its sent copy is not recorded yet; it appears in the inbox once the mailbox syncs it. Also answered for a repeat while that copy is still missing (repeated true).",
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
