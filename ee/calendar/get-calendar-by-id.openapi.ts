import type { ZodOpenApiOperationObject } from "zod-openapi";

import { z } from "zod";

import { CalendarDtoSchema } from "@/ee/calendar/calendar.schema";
import { CommonApiResponses } from "@/core/api/interactor-handler";

export const getCalendarByIdOperation: ZodOpenApiOperationObject = {
  operationId: "getCalendarById",
  summary: "Get a calendar by ID",
  description:
    "Fetches one calendar of a connected account visible to the caller, or null when no calendar with this id is accessible. The id matches the entityId of the messaging.calendar.changed webhook event.",
  tags: ["messaging"],
  security: [{ apiKeyAuth: [] }],
  requestParams: { path: z.object({ id: z.uuid() }) },
  responses: {
    "200": {
      description: "The calendar was retrieved successfully.",
      content: {
        "application/json": {
          schema: CalendarDtoSchema.nullable(),
        },
      },
    },
    ...CommonApiResponses,
  },
};
