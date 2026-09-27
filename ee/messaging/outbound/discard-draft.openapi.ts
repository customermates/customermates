import type { ZodOpenApiOperationObject } from "zod-openapi";

import { z } from "zod";

import { CommonApiResponses, NotFoundApiResponse } from "@/core/api/interactor-handler";
import { DraftRevisionSchema } from "@/ee/messaging/draft-thread";

export const discardDraftOperation: ZodOpenApiOperationObject = {
  operationId: "discardDraft",
  summary: "Discard a message draft",
  description:
    "Deletes exactly the saved draft revision identified by id and draftRevision. A newer edit is never discarded; sent messages are unaffected. An id that holds no draft visible to the key (already discarded or sent, or not a draft) is a safe no-op that returns `threadId: null`. A draftRevision that no longer matches the saved draft answers 404 and deletes nothing.",
  tags: ["messaging"],
  security: [{ apiKeyAuth: [] }],
  requestParams: {
    path: z.object({ id: z.uuid().describe("The draft message id to discard") }),
    query: z.object({ draftRevision: DraftRevisionSchema }),
  },
  responses: {
    "200": {
      description:
        "The draft was discarded and `threadId` is its thread, or `threadId: null` when no draft with this id exists and nothing was deleted.",
      content: {
        "application/json": {
          schema: z.object({ threadId: z.string().nullable() }),
        },
      },
    },
    ...CommonApiResponses,
    ...NotFoundApiResponse,
  },
};
