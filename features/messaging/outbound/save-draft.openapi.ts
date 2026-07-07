import type { ZodOpenApiOperationObject } from "zod-openapi";

import { z } from "zod";

import { SaveDraftSchema } from "@/ee/messaging/outbound/save-draft.interactor";
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
    content: {
      "application/json": {
        schema: SaveDraftSchema.omit({ threadId: true }),
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
