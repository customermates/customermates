import type { ZodOpenApiOperationObject } from "zod-openapi";

import { z } from "zod";

import { CommonApiResponses } from "@/core/api/interactor-handler";
import { DraftRevisionSchema } from "@/ee/messaging/draft-thread";

export const discardDraftOperation: ZodOpenApiOperationObject = {
  operationId: "discardDraft",
  summary: "Discard a message draft",
  description:
    "Deletes exactly the saved draft revision identified by id and draftRevision. A newer edit is never discarded; sent messages are unaffected.",
  tags: ["messaging"],
  security: [{ apiKeyAuth: [] }],
  requestParams: {
    path: z.object({ id: z.uuid().describe("The draft message id to discard") }),
    query: z.object({ draftRevision: DraftRevisionSchema }),
  },
  responses: {
    "200": {
      description: "The draft was discarded.",
      content: {
        "application/json": {
          schema: z.object({ threadId: z.string().nullable() }),
        },
      },
    },
    ...CommonApiResponses,
  },
};
