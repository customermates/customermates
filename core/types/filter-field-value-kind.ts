import { AD_PROVIDER_ORDER } from "@/features/acquisition/ad-provider-registry";
import { FilterFieldKey } from "./filter-field-key";
import { FILTER_FIELD_DEFAULT_OPERATORS } from "./filter-field-operators";

import {
  MessagingProvider,
  MessagingThreadState,
  Status,
  SubscriptionPlan,
  SubscriptionStatus,
} from "@/generated/prisma";

export type FilterEntityKind = "user" | "thread" | "connectedAccount";

export type FilterValueKind =
  | { kind: "entityId"; entity: FilterEntityKind }
  | { kind: "recordRef" }
  | { kind: "enum"; values: readonly string[] }
  | { kind: "date" }
  | { kind: "event" }
  | { kind: "string" }
  | { kind: "linkStatus" }
  | { kind: "draftStatus" };

const enumValues = (e: Record<string, string>): readonly string[] => Object.values(e);

export const TIMELINE_KIND_VIEW_VALUES = ["changes", "messages", "activities"] as const;

export const TIMELINE_KIND_FILTER_VALUES = [
  ...TIMELINE_KIND_VIEW_VALUES,
  "message",
  "audit",
  "activity",
  "calendar_event",
] as const;

export const BOOLEAN_FILTER_VALUES = ["true", "false"] as const;

export const AUDIT_SOURCE_FILTER_VALUES = ["product", "operator"] as const;

export const DEFAULT_FILTER_VALUE_KIND: Record<FilterFieldKey, FilterValueKind> = {
  [FilterFieldKey.participantContactId]: { kind: "recordRef" },
  [FilterFieldKey.ownerUserId]: { kind: "entityId", entity: "user" },
  [FilterFieldKey.timelineThreadId]: { kind: "entityId", entity: "thread" },
  [FilterFieldKey.updatedAt]: { kind: "date" },
  [FilterFieldKey.createdAt]: { kind: "date" },
  [FilterFieldKey.event]: { kind: "event" },
  [FilterFieldKey.url]: { kind: "string" },
  [FilterFieldKey.status]: { kind: "enum", values: enumValues(Status) },
  [FilterFieldKey.provider]: { kind: "enum", values: enumValues(MessagingProvider) },
  [FilterFieldKey.state]: { kind: "enum", values: enumValues(MessagingThreadState) },
  [FilterFieldKey.timelineKind]: { kind: "enum", values: TIMELINE_KIND_FILTER_VALUES },
  [FilterFieldKey.participants]: { kind: "linkStatus" },
  [FilterFieldKey.draft]: { kind: "draftStatus" },
  [FilterFieldKey.connectedAccountId]: { kind: "entityId", entity: "connectedAccount" },
  [FilterFieldKey.emailFolder]: { kind: "string" },
  [FilterFieldKey.lastMessageDirection]: { kind: "enum", values: ["inbound", "outbound"] },
  [FilterFieldKey.lastMessageSentAt]: { kind: "date" },
  [FilterFieldKey.lastMessageAt]: { kind: "date" },
  [FilterFieldKey.calendarId]: { kind: "string" },
  [FilterFieldKey.startsAt]: { kind: "date" },
  [FilterFieldKey.plan]: { kind: "enum", values: enumValues(SubscriptionPlan) },
  [FilterFieldKey.subscriptionStatus]: { kind: "enum", values: enumValues(SubscriptionStatus) },
  [FilterFieldKey.isPlatformOperator]: { kind: "enum", values: BOOLEAN_FILTER_VALUES },
  [FilterFieldKey.lastActiveAt]: { kind: "date" },
  [FilterFieldKey.workspaceId]: { kind: "string" },
  [FilterFieldKey.adProvider]: { kind: "enum", values: AD_PROVIDER_ORDER },
  [FilterFieldKey.auditSource]: { kind: "enum", values: AUDIT_SOURCE_FILTER_VALUES },
  [FilterFieldKey.workspaceTags]: { kind: "string" },
  [FilterFieldKey.name]: { kind: "string" },
  [FilterFieldKey.firstName]: { kind: "string" },
  [FilterFieldKey.lastName]: { kind: "string" },
};

export const FILTER_FIELD_AGENT_NOTES: Partial<Record<FilterFieldKey, string>> = {
  [FilterFieldKey.lastMessageSentAt]:
    "Date of the latest actual sent or received message; ignores drafts, hidden or deleted messages and system events. Use for last message, last received or sent, or no reply for N days; N to M days ago is notInLastDays N plus inLastDays M.",
  [FilterFieldKey.lastMessageAt]:
    "Last activity, including saved drafts. Use only when the user asks about activity, not about the last message.",
  [FilterFieldKey.lastMessageDirection]:
    "inbound means received and outbound means sent, judged on the same latest actual message; draft-only conversations match neither.",
  [FilterFieldKey.emailFolder]:
    "Copy an exact account-qualified option value, a JSON [accountId,folderId] string; connectedAccountId alone covers all visible folders. in matches a conversation with a visible message in any selected folder.",
};

export const filterFieldAgentNote = (field: string): string | undefined =>
  (FILTER_FIELD_AGENT_NOTES as Record<string, string | undefined>)[field];

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
    case "recordRef":
      return `${field} (typeId:recordId reference; operators: ${ops})`;
    case "date":
      return `${field} (ISO date string; operators: ${ops})`;
    case "event":
      return `${field} (an event name; operators: ${ops})`;
    case "string":
      return `${field} (a text value; operators: ${ops})`;
    case "linkStatus":
      return `${field} (CRM-link status; value-less operators: allSet = all participants linked, hasUnset = at least one unlinked)`;
    case "draftStatus":
      return `${field} (draft status; value-less operators: hasSome = thread holds an unsent draft, hasNone = it does not)`;
  }
}

export const filterFieldsHint = (fields: FilterFieldKey[]): string => fields.map(describeFilterFieldValue).join(", ");
