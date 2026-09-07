import type { ZodOpenApiOperationObject } from "zod-openapi";

import { z } from "zod";

import { SaveNewThreadDraftSchema, SaveReplyDraftBodySchema } from "@/ee/messaging/outbound/save-draft.interactor";
import { MessagingMessageDtoSchema } from "@/ee/messaging/inbox/inbox.schema";
import { CommonApiResponses } from "@/core/api/interactor-handler";

export const saveDraftOperation: ZodOpenApiOperationObject = {
  operationId: "saveDraft",
  summary: "Save a message draft",
  description:
    "Saves or updates the draft reply on a thread for the current user to review and send from the inbox. Local only; nothing is delivered. subject, cc, and bcc apply to email threads. There is one draft per thread; saving again replaces it.",
  tags: ["messaging"],
  security: [{ apiKeyAuth: [] }],
  requestParams: {
    path: z.object({ id: z.uuid().describe("The thread id the draft belongs to") }),
  },
  requestBody: {
    required: true,
    content: {
      "application/json": {
        schema: SaveReplyDraftBodySchema,
      },
    },
  },
  responses: {
    "200": {
      description: "The draft was saved.",
      content: {
        "application/json": {
          schema: MessagingMessageDtoSchema,
        },
      },
    },
    ...CommonApiResponses,
  },
};

export const saveNewThreadDraftOperation: ZodOpenApiOperationObject = {
  operationId: "saveNewThreadDraft",
  summary: "Save a draft for a new conversation",
  description:
    "Saves a draft for a conversation that does not exist yet, so it can be reviewed and sent from the inbox. Provide connectedAccountId and recipients; a local draft thread is created and appears in the inbox with the draft filter. Local only; nothing is delivered, and the provider conversation is created when the draft is sent. subject, cc, and bcc apply to email accounts. Reusing the same account and recipient updates the existing draft instead of creating a second one.",
  tags: ["messaging"],
  security: [{ apiKeyAuth: [] }],
  requestBody: {
    required: true,
    content: {
      "application/json": {
        schema: SaveNewThreadDraftSchema,
      },
    },
  },
  responses: {
    "200": {
      description: "The draft was saved.",
      content: {
        "application/json": {
          schema: MessagingMessageDtoSchema,
        },
      },
    },
    ...CommonApiResponses,
  },
};
