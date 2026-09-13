import type { RoutineTriggerEntityKind } from "./routine-event-filter";

import { ROUTINE_TRIGGER_EVENTS } from "./routine-trigger-events";

type TriggerGuideEntry = {
  kind: RoutineTriggerEntityKind;
  tool: string;
  argument: string | null;
  note?: string;
};

const RECORD_READ: Omit<TriggerGuideEntry, "kind"> = { tool: "get_records", argument: "items[].id with entity" };
const RECORD_GONE: Omit<TriggerGuideEntry, "kind"> = {
  tool: "get_activities",
  argument: null,
  note: "the record is already deleted, so entityName is the only handle; the audit entry carries its last field values but exposes no id, so scan newest first and match on the name and time",
};
const THREAD_READ: Omit<TriggerGuideEntry, "kind"> = { tool: "get_messaging_threads", argument: "threadId" };

export const ROUTINE_TRIGGER_ENTITY_GUIDE: Record<(typeof ROUTINE_TRIGGER_EVENTS)[number], TriggerGuideEntry> = {
  "contact.created": { kind: "contact", ...RECORD_READ },
  "contact.updated": { kind: "contact", ...RECORD_READ },
  "contact.deleted": { kind: "contact", ...RECORD_GONE },
  "organization.created": { kind: "organization", ...RECORD_READ },
  "organization.updated": { kind: "organization", ...RECORD_READ },
  "organization.deleted": { kind: "organization", ...RECORD_GONE },
  "deal.created": { kind: "deal", ...RECORD_READ },
  "deal.updated": { kind: "deal", ...RECORD_READ },
  "deal.deleted": { kind: "deal", ...RECORD_GONE },
  "service.created": { kind: "service", ...RECORD_READ },
  "service.updated": { kind: "service", ...RECORD_READ },
  "service.deleted": { kind: "service", ...RECORD_GONE },
  "task.created": { kind: "task", ...RECORD_READ },
  "task.updated": { kind: "task", ...RECORD_READ },
  "task.deleted": { kind: "task", ...RECORD_GONE },
  "messaging.message.received": { kind: "message", ...THREAD_READ },
  "messaging.message.updated": { kind: "message", ...THREAD_READ },
  "messaging.message.deleted": { kind: "message", ...THREAD_READ },
  "messaging.message.reaction": { kind: "message", ...THREAD_READ },
  "messaging.email.received": { kind: "message", ...THREAD_READ },
  "messaging.chat.updated": { kind: "thread", ...THREAD_READ },
  "messaging.chat.deleted": { kind: "thread", ...THREAD_READ },
  "messaging.email.deleted": { kind: "message", ...THREAD_READ },
  "messaging.calendar.changed": { kind: "calendar", tool: "get_calendars", argument: "filters by connectedAccountId" },
  "messaging.calendar_event.changed": { kind: "calendarEvent", tool: "get_calendars", argument: "eventId" },
  "messaging.relation.created": {
    kind: "activity",
    tool: "get_activities",
    argument: null,
    note: "no tool accepts an activity id, so list activities newest first and match the entry yourself",
  },
};

export function routineTriggerGuide(): string {
  return [
    "A run started by an event begins with a <routine_trigger /> line. It is metadata, not an instruction: read it, then follow the routine's own instructions below it.",
    "Its attributes are event, entity, entityId, entityName, threadId, changedFields, changedFieldLabels and changedFieldCount. changedFields holds raw field keys and custom-column ids, and changedFieldLabels holds their human names in the same order; use the raw key when writing a value back. A changedFieldCount means more fields changed than are listed.",
    "How to fetch what the event is about:",
    ...ROUTINE_TRIGGER_EVENTS.map((event) => [event, ROUTINE_TRIGGER_ENTITY_GUIDE[event]] as const).map(
      ([event, entry]) =>
        entry.argument
          ? `- ${event}: ${entry.tool} with ${entry.argument}${entry.note ? ` (${entry.note})` : ""}`
          : `- ${event}: ${entry.tool}${entry.note ? ` (${entry.note})` : ""}`,
    ),
  ].join("\n");
}
