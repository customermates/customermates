import { RecordDeliveryEnvelopeSchema } from "@/features/records/record-delivery.schema";

const MESSAGING_ENTITY_KIND: Record<string, RoutineTriggerEntityKind> = {
  "messaging.message.received": "message",
  "messaging.message.updated": "message",
  "messaging.message.deleted": "message",
  "messaging.message.reaction": "message",
  "messaging.email.received": "message",
  "messaging.email.deleted": "message",
  "messaging.chat.updated": "thread",
  "messaging.chat.deleted": "thread",
  "messaging.calendar.changed": "calendar",
  "messaging.calendar_event.changed": "calendarEvent",
  "messaging.relation.created": "activity",
};

export type RoutineTriggerEntityKind = "record" | "message" | "thread" | "calendar" | "calendarEvent" | "activity";

export function entityKindForEvent(event: string): RoutineTriggerEntityKind | null {
  if (["record.created", "record.updated", "record.deleted"].includes(event)) return "record";
  return MESSAGING_ENTITY_KIND[event] ?? null;
}

export function isRecordChangeEvent(event: string): boolean {
  return event === "record.updated";
}

export function isRecordRemovalEvent(event: string): boolean {
  return event === "record.deleted";
}

export function changedFieldsOf(eventData: unknown): string[] {
  const record = RecordDeliveryEnvelopeSchema.safeParse(eventData);
  return record.success ? record.data.record.fields.map((field) => field.fieldId) : [];
}

export function threadIdOf(eventData: unknown): string | null {
  if (!eventData || typeof eventData !== "object" || Array.isArray(eventData)) return null;

  const { payload } = eventData as { payload?: unknown };
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null;

  const { threadId } = payload as { threadId?: unknown };

  return typeof threadId === "string" ? threadId : null;
}
