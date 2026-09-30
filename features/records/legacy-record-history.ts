import Decimal from "decimal.js";
import { z } from "zod";
import type { RecordField, RecordModel, RecordRef, CalculatedValue } from "./record-model.schema";
import type { RecordHistoryChanges } from "./record-history-reader";
import { RecordScalarSchema } from "./record-model.schema";
import { presetId } from "./crm-preset";
import { RecordHistoryIdentitySchema } from "./record-event.schema";

export const LEGACY_RECORD_KINDS = ["contact", "organization", "deal", "service", "task"] as const;
type LegacyKind = (typeof LEGACY_RECORD_KINDS)[number];
const LegacyEventSchema = z.string().regex(/^(contact|organization|deal|service|task)\.(created|updated|deleted)$/);
const object = (value: unknown): Record<string, unknown> | null =>
  value !== null && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;

export function legacyRecordReference(companyId: string, event: string, entityId: string): RecordRef | null {
  if (!LegacyEventSchema.safeParse(event).success || !z.uuid().safeParse(entityId).success) return null;
  return { typeId: presetId(companyId, event.split(".")[0]), recordId: entityId };
}

export type LegacyHistoryRelation = {
  label: string;
  before: Array<{ ref: RecordRef; title: string }>;
  after: Array<{ ref: RecordRef; title: string }>;
};

function scalar(value: unknown, field: RecordField, currency: string): CalculatedValue {
  if (value === null || value === undefined) return { state: "missing" };
  try {
    let result: unknown;
    if (field.valueType === "richText") {
      if (!object(value)) return { state: "error", code: "type_mismatch" };
      result = { kind: "richText", documentJson: JSON.stringify(value) };
    } else if (field.valueType === "number" || field.valueType === "currency") {
      if (typeof value !== "number" && typeof value !== "string") return { state: "error", code: "type_mismatch" };
      result = {
        kind: "decimal",
        value: new Decimal(value).toFixed(),
        currency: field.valueType === "currency" ? (field.format?.currency ?? currency) : null,
      };
    } else if (field.valueType === "boolean") result = { kind: "boolean", value };
    else if (field.valueType === "date" || field.valueType === "dateTime") result = { kind: field.valueType, value };
    else if (field.valueType === "dateRange" || field.valueType === "dateTimeRange") {
      if (typeof value !== "string" || value.split(",").length !== 2) return { state: "error", code: "type_mismatch" };
      const [start, end] = value.split(",");
      result = { kind: "range", start: start || null, end: end || null };
    } else if (field.valueType === "select") result = value === "" ? null : { kind: "select", value };
    else if (field.multiple) result = typeof value === "string" ? { kind: "textList", value: value.split(",") } : null;
    else result = { kind: "text", value };
    if (result === null) return { state: "missing" };
    const parsed = RecordScalarSchema.safeParse(result);
    return parsed.success ? { state: "value", value: parsed.data } : { state: "error", code: "type_mismatch" };
  } catch {
    return { state: "error", code: "type_mismatch" };
  }
}

export function decodeLegacyRecordHistory(input: {
  companyId: string;
  event: string;
  entityId: string;
  eventData: unknown;
  model: RecordModel;
  currency: string;
  isAdmin: boolean;
  archivedFieldLabel: string;
}): { changes: NonNullable<RecordHistoryChanges>; related: LegacyHistoryRelation[] } | null {
  const ref = legacyRecordReference(input.companyId, input.event, input.entityId);
  if (!ref) return null;
  const kind = input.event.split(".")[0] as LegacyKind;
  const action = input.event.split(".")[1];
  const payload = object(object(input.eventData)?.payload);
  const rawChanges = object(payload?.changes);
  const fields: NonNullable<RecordHistoryChanges>["fields"] = [];
  const related: LegacyHistoryRelation[] = [];
  const changes: NonNullable<RecordHistoryChanges> = {
    ref,
    schemaRevision: Math.max(1, input.model.revision),
    beforeVersion: null,
    afterVersion: null,
    fields,
    assignments: null,
    identities: null,
    links: [],
    related: [],
  };
  const entries = rawChanges
    ? Object.entries(rawChanges).flatMap(([key, value]) => {
        const pair = object(value);
        return pair ? [{ key, before: pair.previous, after: pair.current }] : [];
      })
    : Object.entries(payload ?? {}).map(([key, value]) => ({
        key,
        before: action === "deleted" ? value : undefined,
        after: action === "deleted" ? undefined : value,
      }));
  const addField = (field: RecordField, before: unknown, after: unknown, derived = false) => {
    const read = (value: unknown) =>
      value === undefined
        ? null
        : {
            fieldId: field.id,
            label: field.label,
            valueType: field.valueType,
            format: field.format,
            options: field.options,
            value: derived && !input.isAdmin ? { state: "restricted" as const } : scalar(value, field, input.currency),
          };
    const previous = read(before);
    const current = read(after);
    if ((!previous || previous.value.state === "missing") && (!current || current.value.state === "missing")) return;
    if (JSON.stringify(before) === JSON.stringify(after)) return;
    fields.push({ fieldId: field.id, before: previous, after: current });
  };
  for (const { key, before, after } of entries) {
    if (key === "customFieldValues") {
      const values = (value: unknown) =>
        new Map(
          (Array.isArray(value) ? value : []).flatMap((entry) => {
            const row = object(entry);
            return row && typeof row.columnId === "string" && z.uuid().safeParse(row.columnId).success
              ? [[row.columnId, row.value] as const]
              : [];
          }),
        );
      const previous = values(before);
      const current = values(after);
      for (const fieldId of new Set([...previous.keys(), ...current.keys()])) {
        const definition = input.model.fields.find((field) => field.typeId === ref.typeId && field.id === fieldId);
        const field: RecordField = definition ?? {
          id: fieldId,
          typeId: ref.typeId,
          label: input.archivedFieldLabel,
          valueType: "text",
          behavior: { kind: "input" },
          required: false,
          archived: true,
          publishedSummary: false,
          position: fields.length,
          options: [],
        };
        addField(field, previous.get(fieldId), current.get(fieldId));
      }
      continue;
    }
    if (key === "identifiers" && kind === "contact") {
      const identities = (value: unknown) =>
        (Array.isArray(value) ? value : []).flatMap((entry) => {
          const row = object(entry);
          if (!row) return [];
          const parsed = RecordHistoryIdentitySchema.safeParse({
            id: row.id,
            provider: row.provider,
            value: row.value,
            messagingId: row.messagingId ?? null,
            displayName: row.displayName ?? null,
            profileUrl: row.profileUrl ?? null,
          });
          return parsed.success ? [parsed.data] : [];
        });
      changes.identities = { before: identities(before), after: identities(after) };
      continue;
    }
    if (key === "users") {
      const ids = (value: unknown) => [
        ...new Set(
          (Array.isArray(value) ? value : []).flatMap((entry) => {
            const id = object(entry)?.id;
            return typeof id === "string" && z.uuid().safeParse(id).success ? [id] : [];
          }),
        ),
      ];
      changes.assignments = { before: ids(before), after: ids(after) };
      continue;
    }
    const target = LEGACY_RECORD_KINDS.find((target) => `${target}s` === key);
    if (target) {
      const typeId = presetId(input.companyId, target);
      const type = input.model.types.find((type) => type.id === typeId);
      if (!type) continue;
      const refs = (value: unknown) =>
        (Array.isArray(value) ? value : []).flatMap((entry) => {
          const row = object(entry);
          if (!row || !z.uuid().safeParse(row.id).success) return [];
          const title =
            typeof row.name === "string"
              ? row.name
              : [row.firstName, row.lastName].filter((part) => typeof part === "string").join(" ");
          return [{ ref: { typeId, recordId: row.id as string }, title: title || type.label }];
        });
      related.push({ label: type.pluralLabel, before: refs(before), after: refs(after) });
      continue;
    }
    const field = input.model.fields.find(
      (field) => field.typeId === ref.typeId && field.id === presetId(input.companyId, `${kind}.${key}`),
    );
    if (field)
      addField(field, before, after, kind === "deal" && ["totalValue", "totalQuantity", "weightedValue"].includes(key));
  }
  const order = new Map(input.model.fields.map((field) => [field.id, field.position]));
  fields.sort((a, b) => (order.get(a.fieldId) ?? 0) - (order.get(b.fieldId) ?? 0));
  return { changes, related };
}
