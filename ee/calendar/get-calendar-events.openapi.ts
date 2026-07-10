import type { ZodOpenApiOperationObject } from "zod-openapi";

import { z } from "zod";

import { CalendarEventDtoSchema } from "@/ee/calendar/calendar.schema";
import { GetQueryParamsApiSchema, GetResultSchema } from "@/core/base/base-get.schema";
import { CommonApiResponses } from "@/core/api/interactor-handler";

export const getCalendarEventsOperation: ZodOpenApiOperationObject = {
  operationId: "getCalendarEvents",
  summary: "Get calendar events",
  description:
    "Retrieves calendar events visible to the caller, ordered by start time, with optional filtering (calendarId, connectedAccountId, startsAt date range), sorting, and pagination. Event ids match the entityId of the messaging.calendar.event.changed webhook event.",
  tags: ["messaging"],
  security: [{ apiKeyAuth: [] }],
  requestBody: {
    content: {
      "application/json": {
        schema: GetQueryParamsApiSchema,
      },
    },
  },
  responses: {
    "200": {
      description: "The calendar events were retrieved successfully.",
      content: {
        "application/json": {
          schema: GetResultSchema.extend({
            items: z.array(CalendarEventDtoSchema),
          }),
        },
      },
    },
    ...CommonApiResponses,
  },
};
