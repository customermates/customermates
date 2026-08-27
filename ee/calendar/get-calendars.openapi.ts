import type { ZodOpenApiOperationObject } from "zod-openapi";

import { z } from "zod";

import { CalendarDtoSchema } from "@/ee/calendar/calendar.schema";
import { GetQueryParamsApiSchema, GetResultSchema } from "@/core/base/base-get.schema";
import { CommonApiResponses } from "@/core/api/interactor-handler";

export const getCalendarsOperation: ZodOpenApiOperationObject = {
  operationId: "getCalendars",
  summary: "Get calendars",
  description:
    "Retrieves the calendars of connected accounts visible to the caller (own accounts plus shared ones), with optional filtering (connectedAccountId), search, sorting, and pagination. Calendar ids match the entityId of the messaging.calendar.changed webhook event.",
  tags: ["messaging"],
  security: [{ apiKeyAuth: [] }],
  requestBody: {
    required: true,
    content: {
      "application/json": {
        schema: GetQueryParamsApiSchema,
      },
    },
  },
  responses: {
    "200": {
      description: "The calendars were retrieved successfully.",
      content: {
        "application/json": {
          schema: GetResultSchema.extend({
            items: z.array(CalendarDtoSchema),
          }),
        },
      },
    },
    ...CommonApiResponses,
  },
};
