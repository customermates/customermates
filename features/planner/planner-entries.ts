import type { CalendarEntry } from "@/features/record-calendar/calendar-entries";
import type { CalculatedValue } from "@/features/records/record-model.schema";
import type { RecordRow } from "@/features/records/record-presentation";
import type { PlannerResult } from "./read-planner.interactor";

import { calendarEntry, compareCalendarEntries } from "@/features/record-calendar/calendar-entries";
import { resolveCalendarFields } from "@/features/record-calendar/record-calendar-query";
import { addCalendarDays } from "@/features/record-calendar/calendar-date";
import { zonedDate } from "@/features/record-calendar/zoned-time";

export type PlannerEntry = {
  id: string;
  sourceId: string;
  sourceLabel: string;
  title: CalculatedValue;
  record: RecordRow | null;
  entry: CalendarEntry;
  endInstant: string | null;
  location: string | null;
  provider: string | null;
  updatedAt: string;
};

export function plannerEntries(result: PlannerResult, timeZone: string): PlannerEntry[] {
  const entries: PlannerEntry[] = [];
  for (const data of result.sources) {
    if (data.status !== "ready") continue;
    const { source, presentation } = data;
    const type = presentation.model.types.find((type) => type.id === source.typeId);
    const fields = resolveCalendarFields(source.typeId, source.calendar, presentation.model.fields);
    if (!type || !fields || !presentation.result.calendarRange) continue;
    for (const record of presentation.result.items) {
      const entry = calendarEntry(record, fields, timeZone);
      if (!entry) continue;
      const startResult = record.fields.find((field) => field.fieldId === fields.start.id)?.result;
      const endResult = record.fields.find((field) => field.fieldId === fields.end?.id)?.result;
      const end = endResult?.state === "value" ? endResult.value : null;
      const start = startResult?.state === "value" ? startResult.value : null;
      const id = `${source.id}:${record.ref.recordId}`;
      entries.push({
        id,
        sourceId: source.id,
        sourceLabel: `${type.pluralLabel} · ${fields.start.label}`,
        title: record.fields.find((field) => field.fieldId === type.primaryFieldId)?.result ?? { state: "missing" },
        record,
        entry: { ...entry, id },
        endInstant:
          start?.kind === "range" && fields.start.valueType === "dateTimeRange"
            ? start.end
            : end?.kind === "dateTime"
              ? end.value
              : null,
        location: null,
        provider: null,
        updatedAt: record.updatedAt,
      });
    }
  }
  for (const event of result.events) {
    const start = event.allDay ? event.startsAt.slice(0, 10) : zonedDate(event.startsAt, timeZone);
    const end = event.allDay
      ? addCalendarDays(event.endsAt.slice(0, 10), -1)
      : zonedDate(
          new Date(Math.max(new Date(event.startsAt).getTime(), new Date(event.endsAt).getTime() - 1)),
          timeZone,
        );
    entries.push({
      id: `event:${event.id}`,
      sourceId: event.calendarId,
      sourceLabel: event.provider,
      title: { state: "value", value: { kind: "text", value: event.title } },
      record: null,
      entry: {
        id: `event:${event.id}`,
        start,
        end: end < start ? start : end,
        time: event.allDay ? null : event.startsAt,
        ...(!event.allDay ? { endTime: event.endsAt } : {}),
        color: null,
      },
      endInstant: event.endsAt,
      location: event.location,
      provider: event.provider,
      updatedAt: event.startsAt,
    });
  }
  return entries.sort((a, b) => compareCalendarEntries(a.entry, b.entry) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

export function plannerIsTruncated(result: PlannerResult): boolean {
  return (
    result.personalTruncated ||
    result.sources.some((source) => source.status === "ready" && source.presentation.result.calendarRange?.truncated)
  );
}
