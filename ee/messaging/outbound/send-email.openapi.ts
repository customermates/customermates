import type { ZodOpenApiOperationObject } from "zod-openapi";

import { SendEmailSchema } from "@/ee/messaging/outbound/send-email.interactor";
import { MessagingMessageDtoSchema } from "@/ee/messaging/inbox/inbox.schema";
import { SentMessageReceiptSchema } from "@/ee/messaging/outbound/sent-message-result";
import {
  CommonApiResponses,
  ConflictApiResponse,
  MessagingProviderApiResponses,
  NotFoundApiResponse,
} from "@/core/api/structured-interactor-handler";

export const sendEmailOperation: ZodOpenApiOperationObject = {
  operationId: "sendEmail",
  summary: "Send an email",
  description:
    "Sends a real email (or reply) from a connected email account. Provide either threadId (reply; takes precedence if both are given) or connectedAccountId (new email). At least one recipient is required across to, cc and bcc; use to: [] for Cc-only or Bcc-only email. cc and bcc are plain email strings, unlike `to` which uses the `{ identifier }` object form. Never promote hidden Bcc recipients into To or Cc. The connected account's enabled signature is appended automatically, and its email appearance is applied to plain-text and Markdown bodies. Explicit HTML remains caller-controlled. Set bodyFormat when the body is explicitly plain text, Markdown, or HTML. When delivering a saved draft, pass both draftMessageId and its opaque draftRevision so a newer edit cannot be consumed. threadId may also be the id of a conversation that exists only as a saved draft; it then sends that draft like connectedAccountId does. Each draft revision is sent at most once: repeating the request answers 202 with the first result and repeated true and sends nothing. A draft that changed, whose recipients differ, whose other version was already sent, or whose earlier send is still running or could not be confirmed answers 409 and sends nothing. Compared with earlier versions of this endpoint, an accepted send whose sent copy is not recorded yet answers 202 with a receipt instead of 200 with null, and a stale draftRevision or changed recipients answer 409 instead of 404 with customCode draftMessageNotFound.",
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
      description: "The provider accepted the email. Returns the recorded message, including its thread id.",
      content: {
        "application/json": {
          schema: MessagingMessageDtoSchema,
        },
      },
    },
    "202": {
      description:
        "The provider accepted the email, but its sent copy is not recorded yet (it appears in the inbox once the mailbox syncs it), or this draft revision was already sent and nothing was sent again (repeated true).",
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
        "Not found: no thread or connected account with this id, or customCode draftMessageNotFound when the draft no longer exists and this draft revision was never sent.",
    },
    "409": {
      ...ConflictApiResponse["409"],
      description:
        "Conflict; nothing was sent. Draft conflicts carry a customCode: draftChanged when the draft was saved again after this draftRevision; draftRecipientsChanged when To differs from the saved draft or a saved Bcc recipient was moved into To or Cc; draftTargetMismatch when the draft belongs to another conversation or account; draftSendInProgress while an earlier send of this draft is still running, which counts as unconfirmed (draftSendOutcomeUnknown) after five minutes; draftSendOutcomeUnknown when an earlier send could not be confirmed and may have been delivered, so the draft is sent again only after an edit changes its content; once the sent copy of that earlier send syncs from the mailbox, the draft counts as sent, so a repeat answers 202 with the first result and other content answers draftAlreadySent; draftAlreadySent when this draft was already sent and the request carries other content or another draftRevision. Other conflicts, such as a provider rejection or a disconnected or restricted channel, carry their own customCode.",
    },
  },
};
