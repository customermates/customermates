import type { ZodOpenApiOperationObject } from "zod-openapi";

import { z } from "zod";

import { CommonApiResponses } from "@/core/api/interactor-handler";

export const discardDraftOperation: ZodOpenApiOperationObject = {
  operationId: "discardDraft",
  summary: "Discard a message draft",
  description: "Deletes a draft message by its id. Only draft messages can be discarded; sent messages are unaffected.",
  tags: ["messaging"],
  security: [{ apiKeyAuth: [] }],
  requestParams: {
    path: z.object({ id: z.uuid().describe("The draft message id to discard") }),
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
