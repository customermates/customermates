import type { ZodOpenApiOperationObject } from "zod-openapi";

import { ActivitiesParamsSchema, ActivitiesResultSchema } from "@/ee/messaging/activities/activities.schema";
import { CommonApiResponses } from "@/core/api/interactor-handler";

export const getActivitiesOperation: ZodOpenApiOperationObject = {
  operationId: "getActivities",
  summary: "Get activities",
  description:
    "Retrieves the activity timeline (messages, audit-log changes, calendar events) for the workspace or one record, " +
    "with optional scoping to a single entity, sorting, and pagination.",
  tags: ["messaging"],
  security: [{ apiKeyAuth: [] }],
  requestBody: {
    content: {
      "application/json": {
        schema: ActivitiesParamsSchema,
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
