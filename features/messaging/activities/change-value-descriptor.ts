import type { ChipColor } from "@/constants/chip-colors";
import type { ActivityMemberDto } from "@/ee/messaging/activities/activities.schema";
import type { z } from "zod";
import type { RecordHistoryDisplayValueSchema } from "@/features/records/record-event.schema";
import type {
  CalculatedValue,
  RecordField,
  RecordScalar,
  RecordValueType,
} from "@/features/records/record-model.schema";
import type { MessagingProvider } from "@/generated/prisma";

import { isEmpty } from "@/features/event/audit-changes";
import { USER_STATUS_COLORS_MAP } from "@/constants/user-statuses";
import { serializeJSONToMarkdown } from "@/components/editor/editor.utils";

type RecordHistoryDisplayValue = z.infer<typeof RecordHistoryDisplayValueSchema>;

export type ChangeChoice = { id: string; label: string; color?: ChipColor; provider?: MessagingProvider };

export type ChangeLinkedRecord = { id: string; label: string; icon: string; color: ChipColor | null };

export type ChangeValueDescriptor =
  | { kind: "empty" }
  | { kind: "field"; field: RecordField; result: CalculatedValue }
  | { kind: "choices"; choices: ChangeChoice[] }
  | { kind: "members"; members: ActivityMemberDto[] }
  | { kind: "records"; records: ChangeLinkedRecord[] }
  | { kind: "richText"; markdown: string }
  | { kind: "structured"; value: unknown };

export type ChangeValueLabels = {
  userStatus: (code: string) => string;
  provider: (code: string) => string;
  removalReason: (code: string) => string;
  legalDocument: (code: string) => string;
  wikiKind: (code: string) => string;
  event: (code: string) => string;
  country: (code: string) => string;
  currency: (code: string) => string;
  date: (value: string) => string;
  grant: (action: string) => string;
};

const ISO_DATE_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/;
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;
const EMPTY: ChangeValueDescriptor = { kind: "empty" };

function scalarField(id: string, label: string, valueType: RecordValueType): RecordField {
  return {
    id,
    typeId: id,
    label,
    valueType,
    behavior: { kind: "input" },
    required: false,
    archived: false,
    publishedSummary: false,
    position: 0,
    format: null,
    options: [],
  } as unknown as RecordField;
}

function scalar(key: string, valueType: RecordValueType, value: RecordScalar): ChangeValueDescriptor {
  return { kind: "field", field: scalarField(key, key, valueType), result: { state: "value", value } };
}

function choices(values: unknown[], label: (value: string) => string, color?: (value: string) => ChipColor) {
  return {
    kind: "choices" as const,
    choices: values.map((value) => ({
      id: String(value),
      label: label(String(value)),
      ...(color ? { color: color(String(value)) } : {}),
    })),
  };
}

function markdownOf(value: unknown): string {
  if (typeof value === "string") return value;
  try {
    return serializeJSONToMarkdown(value as object);
  } catch {
    return "";
  }
}

export function auditValueDescriptor(
  key: string,
  value: unknown,
  labels: ChangeValueLabels,
  options: { isWikiEvent?: boolean } = {},
): ChangeValueDescriptor {
  if (isEmpty(value)) return EMPTY;
  if (options.isWikiEvent && key === "kind") return choices([value], labels.wikiKind);
  switch (key) {
    case "notes":
    case "markdown":
      return { kind: "richText", markdown: markdownOf(value) };
    case "users":
      return {
        kind: "members",
        members: (value as ActivityMemberDto[]).map(({ id, firstName, lastName, avatarUrl }) => ({
          id,
          firstName,
          lastName,
          avatarUrl: avatarUrl ?? null,
        })),
      };
    case "identifiers":
      return {
        kind: "choices",
        choices: (value as Array<{ id?: string; provider: MessagingProvider; value: string }>).map((identifier) => ({
          id: identifier.id ?? `${identifier.provider}:${identifier.value}`,
          label: identifier.value,
          provider: identifier.provider,
        })),
      };
    case "status":
      return choices(
        [value],
        labels.userStatus,
        (status) => USER_STATUS_COLORS_MAP[status as keyof typeof USER_STATUS_COLORS_MAP] ?? "default",
      );
    case "country":
      return choices([value], labels.country);
    case "currency":
      return choices([value], labels.currency);
    case "role":
      return choices([value], (role) => role);
    case "provider":
      return choices([value], labels.provider);
    case "removalReason":
      return choices([value], labels.removalReason);
    case "events":
      return choices(Array.isArray(value) ? value : [value], labels.event);
    case "grants":
      return choices(Array.isArray(value) ? value : [value], labels.grant);
    case "changedDocuments":
      return choices(Array.isArray(value) ? value : [value], labels.legalDocument);
    case "versions":
      return {
        kind: "choices",
        choices: Object.entries(value as Record<string, unknown>).map(([document, version]) => ({
          id: document,
          label: `${labels.legalDocument(document)} · ${labels.date(String(version))}`,
        })),
      };
  }
  if (typeof value === "boolean") return scalar(key, "boolean", { kind: "boolean", value });
  if (typeof value === "number")
    return scalar(key, "number", { kind: "decimal", value: String(value), currency: null });
  if (typeof value === "string" && DATE_ONLY.test(value)) return scalar(key, "date", { kind: "date", value });
  if (typeof value === "string" && ISO_DATE_TIME.test(value))
    return scalar(key, "dateTime", { kind: "dateTime", value });
  if (typeof value === "string") return scalar(key, "text", { kind: "text", value });
  if (Array.isArray(value) && value.every((item) => typeof item === "string" || typeof item === "number"))
    return choices(value, (item) => item);
  return { kind: "structured", value };
}

export function recordValueDescriptor(
  side: RecordHistoryDisplayValue | null,
  typeId: string,
  members: readonly ActivityMemberDto[],
): ChangeValueDescriptor {
  if (!side || side.value.state === "missing") return EMPTY;
  if (side.value.state === "value" && side.value.value.kind === "member") {
    const memberId = side.value.value.value;
    const member = members.find((candidate) => candidate.id === memberId);
    return member ? { kind: "members", members: [member] } : EMPTY;
  }
  if (side.value.state === "value" && side.value.value.kind === "richText") {
    let markdown = "";
    try {
      markdown = serializeJSONToMarkdown(JSON.parse(side.value.value.documentJson) as object);
    } catch {
      markdown = "";
    }
    return markdown ? { kind: "richText", markdown } : EMPTY;
  }
  const field = {
    ...scalarField(side.fieldId, side.label, side.valueType),
    typeId,
    format: side.format,
    options: side.options,
  } as RecordField;
  return { kind: "field", field, result: side.value };
}

export function membersDescriptor(
  ids: readonly string[],
  members: readonly ActivityMemberDto[],
): ChangeValueDescriptor {
  const found = ids.flatMap((id) => members.filter((member) => member.id === id));
  return found.length ? { kind: "members", members: found } : EMPTY;
}

export function recordsDescriptor(
  records: ReadonlyArray<{ ref: { typeId: string; recordId: string }; title: string }>,
  lists: Readonly<Record<string, { icon: string; color: ChipColor | null }>>,
): ChangeValueDescriptor {
  if (!records.length) return EMPTY;
  return {
    kind: "records",
    records: records.map((record) => ({
      id: `${record.ref.typeId}:${record.ref.recordId}`,
      label: record.title,
      icon: lists[record.ref.typeId]?.icon ?? "list",
      color: lists[record.ref.typeId]?.color ?? null,
    })),
  };
}
