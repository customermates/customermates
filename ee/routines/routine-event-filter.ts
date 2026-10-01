import { EntityType } from "@/features/records/history/v1/legacy-enums";

import { extractAuditChanges } from "@/features/audit-log/audit-log-changes";
import { RecordDeliveryEnvelopeSchema } from "@/features/records/record-delivery.schema";

const ENTITY_TYPE_BY_EVENT_PREFIX: Record<string, EntityType> = {
  contact: EntityType.contact,
  organization: EntityType.organization,
  deal: EntityType.deal,
  service: EntityType.service,
  task: EntityType.task,
};

export function entityTypeForEvent(event: string): EntityType | null {
  return ENTITY_TYPE_BY_EVENT_PREFIX[event.split(".")[0]] ?? null;
}

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

export type RoutineTriggerEntityKind =
  | EntityType
  | "record"
  | "message"
  | "thread"
  | "calendar"
  | "calendarEvent"
  | "activity";

export function entityKindForEvent(event: string): RoutineTriggerEntityKind | null {
  if (["record.created", "record.updated", "record.deleted"].includes(event)) return "record";
  return entityTypeForEvent(event) ?? MESSAGING_ENTITY_KIND[event] ?? null;
}

export function entityTypeForEvents(events: readonly string[]): EntityType | null {
  const resolved = events.map(entityTypeForEvent);
  if (resolved.some((type) => type === null)) return null;

  const types = new Set(resolved);

  return types.size === 1 ? ([...types][0] ?? null) : null;
}

export function isRecordChangeEvent(event: string): boolean {
  if (event === "record.updated") return true;
  return entityTypeForEvent(event) !== null && event.endsWith(".updated");
}

export function isRecordRemovalEvent(event: string): boolean {
  if (event === "record.deleted") return true;
  return entityTypeForEvent(event) !== null && event.endsWith(".deleted");
}

export function carriesChangedFields(eventData: unknown): boolean {
  const record = RecordDeliveryEnvelopeSchema.safeParse(eventData);
  if (record.success) return record.data.event === "record.updated";
  if (!eventData || typeof eventData !== "object" || Array.isArray(eventData)) return false;

  const { payload } = eventData as { payload?: unknown };
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return false;

  return "changes" in payload;
}

export function changedFieldsOf(eventData: unknown): string[] {
  const record = RecordDeliveryEnvelopeSchema.safeParse(eventData);
  if (record.success) return record.data.record.fields.map((field) => field.fieldId);
  if (!carriesChangedFields(eventData)) return [];

  return extractAuditChanges(eventData).map((change) => change.columnId ?? change.field);
}

export function threadIdOf(eventData: unknown): string | null {
  if (!eventData || typeof eventData !== "object" || Array.isArray(eventData)) return null;

  const { payload } = eventData as { payload?: unknown };
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null;

  const { threadId } = payload as { threadId?: unknown };

  return typeof threadId === "string" ? threadId : null;
}

export function matchesChangedFields(required: readonly string[], changed: readonly string[]): boolean {
  if (required.length === 0) return true;
  if (changed.length === 0) return false;

  const changedSet = new Set(changed);

  return required.some((field) => changedSet.has(field));
}
