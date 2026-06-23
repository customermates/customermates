import { FilterFieldKey } from "./filter-field-key";

import { MessagingProvider, MessagingThreadState, Status } from "@/generated/prisma";

export type FilterEntityKind = "organization" | "contact" | "user" | "deal" | "service" | "task" | "thread";

export type FilterValueKind =
  | { kind: "entityId"; entity: FilterEntityKind }
  | { kind: "enum"; values: readonly string[] }
  | { kind: "date" }
  | { kind: "event" }
  | { kind: "none" };

const enumValues = (e: Record<string, string>): readonly string[] => Object.values(e);

// The activity timeline kinds are a domain literal union (not a Prisma enum), mirrored from ActivityEntry.
const TIMELINE_KINDS = ["message", "audit", "activity", "calendar_event"] as const;

/**
 * Declares, per filter field, how its VALUE is validated against its source of truth.
 * Mirrors FILTER_FIELD_DEFAULT_OPERATORS: one central table keyed by FilterFieldKey.
 * `entityId` defers to the live repo (an existence query); `enum` references the real
 * enum so it never drifts. The Record is EXHAUSTIVE on purpose — a new FilterFieldKey
 * will not compile until its value kind is declared here. Fields with no value to
 * validate (e.g. `participants`, value-less `hasUnset` only) use `{ kind: "none" }`.
 */
export const DEFAULT_FILTER_VALUE_KIND: Record<FilterFieldKey, FilterValueKind> = {
  [FilterFieldKey.userIds]: { kind: "entityId", entity: "user" },
  [FilterFieldKey.serviceIds]: { kind: "entityId", entity: "service" },
  [FilterFieldKey.dealIds]: { kind: "entityId", entity: "deal" },
  [FilterFieldKey.organizationIds]: { kind: "entityId", entity: "organization" },
  [FilterFieldKey.contactIds]: { kind: "entityId", entity: "contact" },
  [FilterFieldKey.taskIds]: { kind: "entityId", entity: "task" },
  [FilterFieldKey.participantContactId]: { kind: "entityId", entity: "contact" },
  [FilterFieldKey.timelineThreadId]: { kind: "entityId", entity: "thread" },
  [FilterFieldKey.updatedAt]: { kind: "date" },
  [FilterFieldKey.createdAt]: { kind: "date" },
  [FilterFieldKey.event]: { kind: "event" },
  [FilterFieldKey.status]: { kind: "enum", values: enumValues(Status) },
  [FilterFieldKey.provider]: { kind: "enum", values: enumValues(MessagingProvider) },
  [FilterFieldKey.state]: { kind: "enum", values: enumValues(MessagingThreadState) },
  [FilterFieldKey.timelineKind]: { kind: "enum", values: TIMELINE_KINDS },
  [FilterFieldKey.participants]: { kind: "none" },
};

export const filterValueKind = (field: string): FilterValueKind | undefined =>
  (DEFAULT_FILTER_VALUE_KIND as Record<string, FilterValueKind | undefined>)[field];

/** Human-readable hint for a filter field's value domain, derived from the same table that validates it. */
export function describeFilterFieldValue(field: FilterFieldKey): string {
  const valueKind = DEFAULT_FILTER_VALUE_KIND[field];
  switch (valueKind.kind) {
    case "enum":
      return `${field} (one of: ${valueKind.values.join(", ")})`;
    case "entityId":
      return `${field} (a ${valueKind.entity} uuid)`;
    case "date":
      return `${field} (ISO date string)`;
    case "event":
      return `${field} (an event name)`;
    case "none":
      return field;
  }
}

export const filterFieldsHint = (fields: FilterFieldKey[]): string => fields.map(describeFilterFieldValue).join(", ");
