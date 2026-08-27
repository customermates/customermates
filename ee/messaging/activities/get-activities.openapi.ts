import type { ZodOpenApiOperationObject } from "zod-openapi";

import { ActivitiesApiParamsSchema, ActivitiesResultSchema } from "@/ee/messaging/activities/activities.schema";
import { CommonApiResponses } from "@/core/api/interactor-handler";

export const getActivitiesOperation: ZodOpenApiOperationObject = {
  operationId: "getActivities",
  summary: "Get activities",
  description:
    "Retrieves the activity timeline (messages, audit-log changes, account activities, and calendar events) for " +
    "the workspace, whole record types, or one or several specific records, with optional filters, sorting, and pagination.",
  tags: ["messaging"],
  security: [{ apiKeyAuth: [] }],
  requestBody: {
    required: true,
    content: {
      "application/json": {
        schema: ActivitiesApiParamsSchema,
      },
    },
  },
  responses: {
    "200": {
      description: "The activities were retrieved successfully.",
      content: {
        "application/json": {
          schema: ActivitiesResultSchema,
        },
      },
    },
    ...CommonApiResponses,
  },
};
