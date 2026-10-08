import { changedFieldsOf, threadIdOf } from "./routine-event-filter";
import { routineRecordReference } from "./routine-record-reference";
import type { RecordRef } from "@/features/records/record-model.schema";
import { RecordDeliveryEnvelopeSchema } from "@/features/records/record-delivery.schema";

export const ROUTINE_TRIGGER_FIELD_LIMIT = 24;

export type RoutineRunTriggerContext = {
  threadId: string | null;
  changedFields: string[];
  changedFieldsTruncated: boolean;
  changedFieldLabels: Record<string, string>;
  recordRef?: RecordRef;
};

export function routineRunTriggerContext(
  triggerEvent: string | null,
  triggerPayload: unknown,
): RoutineRunTriggerContext | null {
  if (!triggerEvent) return null;

  const changed = changedFieldsOf(triggerPayload);
  const ref = routineRecordReference(triggerPayload);
  const envelope = RecordDeliveryEnvelopeSchema.safeParse(triggerPayload);
  const labels = envelope.success
    ? Object.fromEntries(
        envelope.data.data.record.fields.flatMap((field) => {
          const label = field.after?.label ?? field.before?.label;
          return label ? [[field.fieldId, label]] : [];
        }),
      )
    : {};

  return {
    ...(ref ? { recordRef: ref } : {}),
    threadId: threadIdOf(triggerPayload),
    changedFields: changed.slice(0, ROUTINE_TRIGGER_FIELD_LIMIT),
    changedFieldsTruncated: changed.length > ROUTINE_TRIGGER_FIELD_LIMIT,
    changedFieldLabels: Object.fromEntries(
      changed.slice(0, ROUTINE_TRIGGER_FIELD_LIMIT).flatMap((id) => (labels[id] ? [[id, labels[id]]] : [])),
    ),
  };
}
