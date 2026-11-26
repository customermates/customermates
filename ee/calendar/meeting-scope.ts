import type { MeetingScope } from "./meeting.schema";

export type MeetingTarget = { kind: "event" } | { kind: "series"; masterUnipileEventId: string };

export function meetingTarget(
  event: { recurrenceRule?: string | null; masterUnipileEventId?: string | null },
  scope: MeetingScope | undefined,
): MeetingTarget | null {
  const master = event.masterUnipileEventId;
  if (master) return scope === "series" ? { kind: "series", masterUnipileEventId: master } : { kind: "event" };
  if (event.recurrenceRule) return scope === "occurrence" ? null : { kind: "event" };
  return scope === "series" ? null : { kind: "event" };
}

export function meetingTimingFits(
  event: { allDay?: boolean },
  change: { startsAt?: string; startDate?: string },
): boolean {
  if (change.startDate !== undefined) return Boolean(event.allDay);
  if (change.startsAt !== undefined) return !event.allDay;
  return true;
}
