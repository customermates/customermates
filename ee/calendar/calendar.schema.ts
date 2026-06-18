import type { Data } from "@/core/validation/validation.utils";

import { z } from "zod";

import { CalendarEventStatus } from "@/generated/prisma";

const CalendarEventStatusSchema = z.enum(CalendarEventStatus);

const CalendarAttendeeSchema = z.object({
  email: z.string(),
  displayName: z.string().nullable(),
  responseStatus: z.string().nullable(),
  isOrganizer: z.boolean().default(false),
});
export type CalendarAttendee = z.infer<typeof CalendarAttendeeSchema>;

const CalendarEventCoreSchema = z.object({
  unipileEventId: z.string(),
  title: z.string(),
  description: z.string().nullable(),
  location: z.string().nullable(),
  conferenceUrl: z.string().nullable(),
  startsAt: z.date(),
  endsAt: z.date(),
  allDay: z.boolean(),
  timezone: z.string().nullable(),
  recurrenceRule: z.string().nullable(),
  status: CalendarEventStatusSchema,
  visibility: z.string().nullable(),
  attendees: z.array(CalendarAttendeeSchema),
  organizer: CalendarAttendeeSchema.nullable(),
});

export type CalendarEventCore = z.infer<typeof CalendarEventCoreSchema>;

export const CalendarEventSchema = CalendarEventCoreSchema.extend({
  id: z.uuid(),
  connectedAccountId: z.uuid(),
  calendarId: z.uuid(),
  createdAt: z.date(),
  updatedAt: z.date(),
});
export type CalendarEvent = Data<typeof CalendarEventSchema>;
