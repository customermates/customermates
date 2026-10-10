import type { RecordField, RecordModel, RecordScalar } from "./record-model.schema";
import type { StoredRecord } from "./record.repo";

import { decodeRecordValue } from "./record-storage";
import { normalizeRecordScalar, RecordWriteError } from "./record-write.service";
import { CustomErrorCode } from "@/core/validation/validation.types";
import { canonicalRecordJson, compareRecordKey } from "./record-json";

export function fieldValueDefinition(field: RecordField | undefined): string {
  if (!field) return "";
  return canonicalRecordJson({
    valueType: field.valueType,
    multiple: field.multiple ?? false,
    required: field.required,
    archived: field.archived,
    publishedSummary: field.publishedSummary,
    currency: field.valueType === "currency" ? (field.format?.currency ?? null) : null,
    behavior: field.behavior,
    options: field.options
      .map(({ id, attributes }) => ({ id, attributes }))
      .sort((a, b) => compareRecordKey(a.id, b.id)),
  });
}

export function configurationInputFields(previous: RecordModel, next: RecordModel): RecordField[] {
  return next.fields.filter(
    (field) =>
      !field.archived &&
      field.valueType !== "channels" &&
      (field.behavior.kind === "input" ||
        (field.behavior.kind === "snapshot" && previous.fields.some((before) => before.id === field.id))) &&
      fieldValueDefinition(previous.fields.find((before) => before.id === field.id)) !== fieldValueDefinition(field),
  );
}

export function configurationInputValue(
  row: StoredRecord,
  before: RecordField | undefined,
  field: RecordField,
): RecordScalar | null {
  const value = decodeRecordValue(
    row.values.find((value) => value.fieldId === field.id),
    before ?? field,
  );
  if (before && value.state === "error") throw new RecordWriteError(CustomErrorCode.recordValueInvalid);
  const scalar =
    value.state === "value"
      ? value.value
      : before || field.behavior.kind !== "input"
        ? null
        : (field.behavior.defaultValue ?? null);
  return normalizeRecordScalar(
    convertChoiceScalar(scalar, field),
    row.protectedKind === "membershipAuthorization" ? { ...field, required: false } : field,
  );
}

function convertChoiceScalar(scalar: RecordScalar | null, field: RecordField): RecordScalar | null {
  if (field.valueType !== "select" || !scalar) return scalar;
  if (field.multiple && scalar.kind === "select") return { kind: "selectList", value: [scalar.value] };
  if (!field.multiple && scalar.kind === "selectList" && scalar.value.length === 1)
    return { kind: "select", value: scalar.value[0] };
  return scalar;
}
