import { changedFieldsOf, entityKindForEvent, threadIdOf } from "./routine-event-filter";
import { ROUTINE_TRIGGER_FIELD_LIMIT } from "./routine-run-trigger-context";
import { routineRecordReference } from "./routine-record-reference";
import { RecordDeliveryEnvelopeSchema } from "@/features/records/record-delivery.schema";

export type RoutineTriggerContext = {
  routineName: string;
  triggerEvent?: string | null;
  triggerEntityId?: string | null;
  triggerPayload?: unknown;
  changedFieldLabels?: Record<string, string>;
};

function attributeValue(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .slice(0, 500);
}

function attribute(name: string, value: string | null | undefined): string | null {
  return value ? `${name}="${attributeValue(value)}"` : null;
}

export function composeRoutinePrompt(prompt: string, context: RoutineTriggerContext): string {
  if (!context.triggerEvent) return prompt;

  const changed = changedFieldsOf(context.triggerPayload);
  const record = RecordDeliveryEnvelopeSchema.safeParse(context.triggerPayload);
  const ref = routineRecordReference(context.triggerPayload);
  const recordLabels = record.success
    ? Object.fromEntries(
        record.data.data.record.fields.map((field) => [field.fieldId, field.after?.label ?? field.before?.label]),
      )
    : {};
  const fields = changed.slice(0, ROUTINE_TRIGGER_FIELD_LIMIT);
  const labels = fields.map((field) => recordLabels[field] ?? context.changedFieldLabels?.[field] ?? field);
  const attributes = [
    attribute("event", context.triggerEvent),
    attribute("entity", entityKindForEvent(context.triggerEvent)),
    attribute("entityId", context.triggerEntityId),
    attribute("typeId", ref?.typeId),
    attribute("recordId", ref?.recordId),
    attribute("threadId", threadIdOf(context.triggerPayload)),
    attribute("changedFields", fields.length > 0 ? fields.join(",") : null),
    attribute("changedFieldLabels", fields.length > 0 ? labels.join(",") : null),
    attribute("changedFieldCount", changed.length > fields.length ? String(changed.length) : null),
  ].filter((entry): entry is string => entry !== null);

  return `<routine_trigger ${attributes.join(" ")} />\n${prompt}`;
}

const ROUTINE_TRIGGER_BLOCK = /^<routine_trigger\b[^>]*\/>\n?/;

export function stripRoutineTriggerBlock(text: string): string {
  return text.replace(ROUTINE_TRIGGER_BLOCK, "");
}
