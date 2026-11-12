import type { RecordField, RecordScalar } from "@/features/records/record-model.schema";
import type { RecordIdentityInput } from "@/features/records/record-identity.schema";
import type { FormAnswerValue, FormAssignment } from "@/features/public-form/public-form-answers";
import type { IncomingWebhookMapping } from "./incoming-webhook.schema";

import { convertField } from "@/features/public-form/public-form-answers";
import { isFormEligibleField } from "@/features/public-form/public-form-fields";

export type MappedValue = {
  fieldId: string;
  path: string;
  value: string | null;
  error: "required" | "invalid" | null;
};

export type MappedPayload =
  | {
      ok: true;
      fields: FormAssignment[];
      identities: RecordIdentityInput[];
      match: { fieldId: string; scalar: RecordScalar | null; identity: RecordIdentityInput | null } | null;
      values: MappedValue[];
    }
  | { ok: false; values: MappedValue[] };

const PATH_PART = /[^.[\]]+|\[(\d+)\]/gu;

export function readJsonPath(payload: unknown, path: string): unknown {
  let current: unknown = payload;
  for (const part of path.matchAll(PATH_PART)) {
    if (current === null || typeof current !== "object") return undefined;
    const key = part[1] ?? part[0];
    current = (current as Record<string, unknown>)[key];
  }
  return current;
}

function scalarText(raw: unknown): string | undefined {
  if (typeof raw === "string") return raw;
  if (typeof raw === "number" && Number.isFinite(raw)) return String(raw);
  return undefined;
}

export function toAnswerValue(field: RecordField, raw: unknown): FormAnswerValue | undefined {
  if (raw === null || raw === undefined) return undefined;
  if (field.valueType === "boolean") return typeof raw === "boolean" ? raw : scalarText(raw);
  if (Array.isArray(raw)) {
    const items = raw.flatMap((entry) => scalarText(entry) ?? []);
    return field.valueType === "select" && field.multiple ? items : (items[0] ?? undefined);
  }
  if (field.valueType === "date") return scalarText(raw)?.slice(0, 10);
  return scalarText(raw);
}

function selectIds(field: RecordField, value: FormAnswerValue | undefined): FormAnswerValue | undefined {
  if (field.valueType !== "select" || value === undefined) return value;
  const toId = (entry: string) => {
    const byId = field.options.find((option) => option.id === entry);
    const byLabel = field.options.find((option) => option.label.toLowerCase() === entry.trim().toLowerCase());
    return (byId ?? byLabel)?.id ?? entry;
  };
  return Array.isArray(value) ? value.map(toId) : typeof value === "string" ? toId(value) : value;
}

export function mapIncomingPayload(
  mapping: IncomingWebhookMapping,
  payload: unknown,
  typeId: string,
  modelFields: readonly RecordField[],
): MappedPayload {
  const fields: FormAssignment[] = [];
  const identities: RecordIdentityInput[] = [];
  const values: MappedValue[] = [];
  let match: Extract<MappedPayload, { ok: true }>["match"] = null;

  for (const entry of mapping.fields) {
    const field = modelFields.find(
      (candidate) => candidate.id === entry.fieldId && candidate.typeId === typeId && isFormEligibleField(candidate),
    );
    if (!field) {
      values.push({ fieldId: entry.fieldId, path: entry.path, value: null, error: "invalid" });
      continue;
    }
    const raw = selectIds(field, toAnswerValue(field, readJsonPath(payload, entry.path)));
    const converted = convertField(field, raw);
    if (converted.kind === "skip") {
      values.push({ fieldId: entry.fieldId, path: entry.path, value: null, error: field.required ? "required" : null });
    } else if (converted.kind === "error") {
      values.push({ fieldId: entry.fieldId, path: entry.path, value: null, error: "invalid" });
    } else {
      values.push({ fieldId: entry.fieldId, path: entry.path, value: converted.display, error: null });
      const isMatch = mapping.mode === "upsert" && mapping.matchFieldId === entry.fieldId;
      if (converted.kind === "identity") {
        identities.push(converted.identity);
        if (isMatch) match = { fieldId: entry.fieldId, scalar: null, identity: converted.identity };
      } else {
        fields.push({ fieldId: entry.fieldId, value: converted.value });
        if (isMatch) match = { fieldId: entry.fieldId, scalar: converted.value, identity: null };
      }
    }
  }

  const failed = values.some((value) => value.error !== null);
  const missingMatch = mapping.mode === "upsert" && match === null;
  if (failed || missingMatch) {
    const matchEntry = mapping.fields.find((entry) => entry.fieldId === mapping.matchFieldId);
    return {
      ok: false,
      values:
        missingMatch && matchEntry && !values.some((value) => value.fieldId === matchEntry.fieldId && value.error)
          ? values.map((value) => (value.fieldId === matchEntry.fieldId ? { ...value, error: "required" } : value))
          : values,
    };
  }
  return { ok: true, fields, identities, match, values };
}
