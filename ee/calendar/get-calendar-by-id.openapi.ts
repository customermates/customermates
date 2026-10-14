import type { ZodOpenApiOperationObject } from "zod-openapi";

import { z } from "zod";

import { CalendarDtoSchema } from "@/ee/calendar/calendar.schema";
import { CommonApiResponses, NotFoundApiResponse } from "@/core/api/structured-interactor-handler";

export const getCalendarByIdOperation: ZodOpenApiOperationObject = {
  operationId: "getCalendarById",
  summary: "Get a calendar by ID",
  description:
    "Fetches one calendar of a connected account visible to the caller. An id that is unknown, belongs to another workspace or to a calendar the caller cannot see answers 404 not_found with customCode calendarNotFound. The id matches the entityId of the messaging.calendar.changed webhook event.",
  tags: ["messaging"],
  security: [{ apiKeyAuth: [] }],
  requestParams: { path: z.object({ id: z.uuid() }) },
  responses: {
    "200": {
      description: "The calendar was retrieved successfully.",
      content: {
        "application/json": {
          schema: CalendarDtoSchema,
        },
      },
    },
    ...CommonApiResponses,
    ...NotFoundApiResponse,
  },
};
