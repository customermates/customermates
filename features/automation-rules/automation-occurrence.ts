import type { DateReachedTriggerSchema } from "./automation-rule.schema";
import type { z } from "zod";

type DateReachedTrigger = z.output<typeof DateReachedTriggerSchema>;

export function eventOccurrenceKey(eventId: string): string {
  return `event:${eventId}`;
}

export function dateOccurrenceKey(
  trigger: Pick<DateReachedTrigger, "days" | "direction" | "fieldId">,
  recordId: string,
  fieldValue: string,
): string {
  return `date:${recordId}:${trigger.fieldId}:${fieldValue}:${trigger.direction}${trigger.days}`;
}

export function externalOccurrenceKey(event: "form.submitted" | "webhook.received", occurrenceId: string): string {
  return `external:${event}:${occurrenceId}`;
}
