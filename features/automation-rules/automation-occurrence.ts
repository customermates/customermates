import type { DateReachedTriggerSchema } from "./automation-rule.schema";
import type { AutomationDateCandidate } from "./automation-rule.repo";
import type { z } from "zod";

import { dateReachedFireAt, isDateReachedDue } from "./automation-date";
import { AUTOMATION_DATE_LOOKBACK_DAYS } from "./automation-rule.schema";

type DateReachedTrigger = z.output<typeof DateReachedTriggerSchema>;

const DAY_ONLY = /^\d{4}-\d{2}-\d{2}$/;

export type DueDateOccurrence = { recordId: string; fieldValue: string; fireAt: Date; key: string };

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

export function dueDateOccurrences(
  trigger: DateReachedTrigger,
  candidates: readonly AutomationDateCandidate[],
  now: Date,
): DueDateOccurrence[] {
  return candidates.flatMap((candidate) => {
    const fireAt = dateReachedFireAt(trigger, {
      kind: DAY_ONLY.test(candidate.fieldValue) ? "date" : "dateTime",
      value: candidate.fieldValue,
    });
    if (!fireAt || !isDateReachedDue(fireAt, now, AUTOMATION_DATE_LOOKBACK_DAYS)) return [];
    return [
      {
        recordId: candidate.recordId,
        fieldValue: candidate.fieldValue,
        fireAt,
        key: dateOccurrenceKey(trigger, candidate.recordId, candidate.fieldValue),
      },
    ];
  });
}
