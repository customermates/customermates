import { FilterFieldKey } from "./filter-field-key";
import { FILTER_FIELD_DEFAULT_OPERATORS } from "./filter-field-operators";

import { MessagingProvider, MessagingThreadState, Status } from "@/generated/prisma";

export type FilterEntityKind = "organization" | "contact" | "user" | "deal" | "service" | "task" | "thread";

export type FilterValueKind =
  | { kind: "entityId"; entity: FilterEntityKind }
  | { kind: "enum"; values: readonly string[] }
  | { kind: "date" }
  | { kind: "event" }
  | { kind: "string" }
  | { kind: "linkStatus" };

const enumValues = (e: Record<string, string>): readonly string[] => Object.values(e);

const TIMELINE_KINDS = ["message", "audit", "activity", "calendar_event"] as const;

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
  [FilterFieldKey.url]: { kind: "string" },
  [FilterFieldKey.status]: { kind: "enum", values: enumValues(Status) },
  [FilterFieldKey.provider]: { kind: "enum", values: enumValues(MessagingProvider) },
  [FilterFieldKey.state]: { kind: "enum", values: enumValues(MessagingThreadState) },
  [FilterFieldKey.timelineKind]: { kind: "enum", values: TIMELINE_KINDS },
  [FilterFieldKey.participants]: { kind: "linkStatus" },
};

export const filterValueKind = (field: string): FilterValueKind | undefined =>
  (DEFAULT_FILTER_VALUE_KIND as Record<string, FilterValueKind | undefined>)[field];

export function describeFilterFieldValue(field: FilterFieldKey): string {
  const valueKind = DEFAULT_FILTER_VALUE_KIND[field];
  const ops = FILTER_FIELD_DEFAULT_OPERATORS[field].join(", ");
  switch (valueKind.kind) {
    case "enum":
      return `${field} (one of: ${valueKind.values.join(", ")}; operators: ${ops})`;
    case "entityId":
      return `${field} (a ${valueKind.entity} uuid; operators: ${ops})`;
    case "date":
      return `${field} (ISO date string; operators: ${ops})`;
    case "event":
      return `${field} (an event name; operators: ${ops})`;
    case "string":
      return `${field} (a text value; operators: ${ops})`;
    case "linkStatus":
      return `${field} (CRM-link status; value-less operators: allSet = all participants linked, hasUnset = at least one unlinked)`;
  }
}

export const filterFieldsHint = (fields: FilterFieldKey[]): string => fields.map(describeFilterFieldValue).join(", ");
