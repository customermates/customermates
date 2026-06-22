import type { ZodOpenApiOperationObject } from "zod-openapi";

import { z } from "zod";

import { CommonApiResponses } from "@/core/api/interactor-handler";
import { ConnectedAccountDtoSchema } from "@/ee/messaging/messaging.schema";

export const getConnectedAccountsOperation: ZodOpenApiOperationObject = {
  operationId: "getConnectedAccounts",
  summary: "List own connected accounts",
  description: "Lists the messaging accounts connected to the workspace and visible to the authenticated user.",
  tags: ["messaging"],
  security: [{ apiKeyAuth: [] }],
  responses: {
    "200": {
      description: "The connected accounts were retrieved successfully.",
      content: {
        "application/json": {
          schema: z.array(ConnectedAccountDtoSchema),
        },
      },
    },
    ...CommonApiResponses,
  },
};
