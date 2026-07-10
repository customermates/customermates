import type { ZodOpenApiOperationObject } from "zod-openapi";

import { z } from "zod";

import { CalendarEventDtoSchema } from "@/ee/calendar/calendar.schema";
import { CommonApiResponses } from "@/core/api/interactor-handler";

export const getCalendarEventByIdOperation: ZodOpenApiOperationObject = {
  operationId: "getCalendarEventById",
  summary: "Get a calendar event by ID",
  description:
    "Fetches one calendar event visible to the caller, including organizer and attendees, or null when no event with this id is accessible. The id matches the entityId of the messaging.calendar.event.changed webhook event.",
  tags: ["messaging"],
  security: [{ apiKeyAuth: [] }],
  requestParams: { path: z.object({ id: z.uuid() }) },
  responses: {
    "200": {
      description: "The calendar event was retrieved successfully.",
      content: {
        "application/json": {
          schema: CalendarEventDtoSchema.nullable(),
        },
      },
    },
    ...CommonApiResponses,
  },
};
