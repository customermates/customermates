import type { RecordRef } from "@/features/records/record-model.schema";

import type { CalendarEventCore } from "./calendar.schema";
import type { Meeting } from "./meeting.schema";

export function toMeeting(input: {
  id: string;
  calendarId: string;
  event: CalendarEventCore;
  records: RecordRef[];
  action: RecordRef | null;
  warnings: Meeting["warnings"];
}): Meeting {
  const { event } = input;

  return {
    id: input.id,
    calendarId: input.calendarId,
    title: event.title,
    description: event.description,
    location: event.location,
    conferenceUrl: event.conferenceUrl,
    startsAt: event.startsAt.toISOString(),
    endsAt: event.endsAt.toISOString(),
    timeZone: event.timezone,
    status: event.status,
    attendees: event.attendees.map((attendee) => ({
      email: attendee.email,
      displayName: attendee.displayName,
      responseStatus: attendee.responseStatus,
    })),
    records: input.records,
    action: input.action,
    warnings: input.warnings,
  };
}
