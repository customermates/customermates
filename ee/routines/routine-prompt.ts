import { changedFieldsOf, entityKindForEvent, entityTypeForEvent, threadIdOf } from "./routine-event-filter";
import { getEntityName } from "@/features/event/entity-name.utils";
import { ROUTINE_TRIGGER_FIELD_LIMIT } from "./routine-run-trigger-context";

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

function recordName(context: RoutineTriggerContext): string | null {
  if (!context.triggerEvent || !entityTypeForEvent(context.triggerEvent)) return null;

  return getEntityName(context.triggerEvent as never, context.triggerPayload as never) ?? null;
}

export function composeRoutinePrompt(prompt: string, context: RoutineTriggerContext): string {
  if (!context.triggerEvent) return prompt;

  const changed = changedFieldsOf(context.triggerPayload);
  const fields = changed.slice(0, ROUTINE_TRIGGER_FIELD_LIMIT);
  const labels = fields.map((field) => context.changedFieldLabels?.[field] ?? field);
  const attributes = [
    attribute("event", context.triggerEvent),
    attribute("entity", entityKindForEvent(context.triggerEvent)),
    attribute("entityId", context.triggerEntityId),
    attribute("entityName", recordName(context)),
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
