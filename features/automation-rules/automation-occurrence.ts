import type { CalculatedValue } from "@/features/records/record-model.schema";
import type { DateReachedTriggerSchema } from "./automation-rule.schema";
import type { AutomationDateCandidate } from "./automation-rule.repo";
import type { z } from "zod";

import { dateReachedFireAt, isDateReachedDue } from "./automation-date";
import { AUTOMATION_DATE_LOOKBACK_DAYS } from "./automation-rule.schema";

type DateReachedTrigger = z.output<typeof DateReachedTriggerSchema>;

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

export function publicOccurrenceKey(key: string, withRecord = true): string {
  if (!key.startsWith("date:")) return key;
  const parts = key.split(":");
  if (parts.length < 5 || !withRecord) return "date";
  return ["date", parts[1], parts[2], parts.at(-1)].join(":");
}

export function normalisedDateValue(candidate: Pick<AutomationDateCandidate, "kind" | "fieldValue">): string | null {
  if (candidate.kind === "date") {
    const day = candidate.fieldValue.slice(0, 10);
    return /^\d{4}-\d{2}-\d{2}$/.test(day) ? day : null;
  }
  const instant = new Date(candidate.fieldValue);
  return Number.isNaN(instant.getTime()) ? null : instant.toISOString();
}

export function currentDateValue(
  kind: AutomationDateCandidate["kind"],
  current: CalculatedValue | undefined,
): string | null {
  if (current?.state !== "value") return null;
  const scalar = current.value;
  if (scalar.kind !== "date" && scalar.kind !== "dateTime") return null;
  return normalisedDateValue({ kind, fieldValue: scalar.value });
}

export function dueDateOccurrences(
  trigger: DateReachedTrigger,
  candidates: readonly AutomationDateCandidate[],
  now: Date,
): DueDateOccurrence[] {
  return candidates.flatMap((candidate) => {
    const fieldValue = normalisedDateValue(candidate);
    if (fieldValue === null) return [];
    const fireAt = dateReachedFireAt(trigger, { kind: candidate.kind, value: fieldValue });
    if (!fireAt || !isDateReachedDue(fireAt, now, AUTOMATION_DATE_LOOKBACK_DAYS)) return [];
    return [
      {
        recordId: candidate.recordId,
        fieldValue,
        fireAt,
        key: dateOccurrenceKey(trigger, candidate.recordId, fieldValue),
      },
    ];
  });
}
