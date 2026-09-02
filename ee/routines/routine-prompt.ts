import { changedFieldsOf, entityTypeForEvent, threadIdOf } from "./routine-event-filter";

export type RoutineTriggerContext = {
  routineName: string;
  triggerEvent?: string | null;
  triggerEntityId?: string | null;
  triggerPayload?: unknown;
};

const TRIGGER_FIELD_LIMIT = 24;

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

  const fields = changedFieldsOf(context.triggerPayload).slice(0, TRIGGER_FIELD_LIMIT);
  const attributes = [
    attribute("event", context.triggerEvent),
    attribute("entity", entityTypeForEvent(context.triggerEvent)),
    attribute("entityId", context.triggerEntityId),
    attribute("threadId", threadIdOf(context.triggerPayload)),
    attribute("changedFields", fields.length > 0 ? fields.join(",") : null),
  ].filter((entry): entry is string => entry !== null);

  return `<routine_trigger ${attributes.join(" ")} />\n${prompt}`;
}

const ROUTINE_TRIGGER_BLOCK = /^<routine_trigger\b[^>]*\/>\n?/;

export function stripRoutineTriggerBlock(text: string): string {
  return text.replace(ROUTINE_TRIGGER_BLOCK, "");
}
