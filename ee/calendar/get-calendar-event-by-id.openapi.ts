import type { ZodOpenApiOperationObject } from "zod-openapi";

import { z } from "zod";

import { CalendarEventDtoSchema } from "@/ee/calendar/calendar.schema";
import { CommonApiResponses, NotFoundApiResponse } from "@/core/api/structured-interactor-handler";

export const getCalendarEventByIdOperation: ZodOpenApiOperationObject = {
  operationId: "getCalendarEventById",
  summary: "Get a calendar event by ID",
  description:
    "Fetches one calendar event visible to the caller, including organizer and attendees. An id that is unknown, belongs to another workspace or to an event the caller cannot see answers 404 not_found with customCode calendarEventNotFound. The id matches the entityId of the messaging.calendar.event.changed webhook event.",
  tags: ["messaging"],
  security: [{ apiKeyAuth: [] }],
  requestParams: { path: z.object({ id: z.uuid() }) },
  responses: {
    "200": {
      description: "The calendar event was retrieved successfully.",
      content: {
        "application/json": {
          schema: CalendarEventDtoSchema,
        },
      },
    },
    ...CommonApiResponses,
    ...NotFoundApiResponse,
  },
};
