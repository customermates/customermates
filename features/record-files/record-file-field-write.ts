import type { Validated } from "@/core/validation/validation.utils";
import type { RecordRepo } from "@/features/records/record.repo";
import type { MutateRecordInput, RecordOperationResult } from "@/features/records/record-query.schema";

import { failNotFound } from "@/core/validation/interactor-failure-server";
import { CustomErrorCode } from "@/core/validation/validation.types";

export type RecordFileFieldTarget = {
  typeId: string;
  recordId: string;
  fieldId: string;
  mode?: "append" | "replace";
  expectedVersion?: number;
};

export type RecordFileFieldWriteDeps = {
  records: Pick<RecordRepo, "getModel" | "getRecordCompanyWide">;
  mutate: { invoke(input: MutateRecordInput): Validated<RecordOperationResult> };
};

export async function writeRecordFileIntoField(
  { records, mutate }: RecordFileFieldWriteDeps,
  fileId: string,
  target: RecordFileFieldTarget,
  idempotencyKey: string,
): Validated<RecordOperationResult> {
  const ref = { typeId: target.typeId, recordId: target.recordId };
  const [model, record] = await Promise.all([records.getModel(), records.getRecordCompanyWide(ref)]);
  if (!record) return failNotFound(CustomErrorCode.recordNotFound, ["recordId"]);
  const field = model.fields.find((candidate) => candidate.id === target.fieldId);
  const stored = record.values.find((value) => value.fieldId === target.fieldId);
  const current = stored?.state === "value" ? stored.textListValue : [];
  const mode = target.mode ?? (field?.multiple ? "append" : "replace");
  const ids = mode === "replace" ? [fileId] : [...current.filter((id) => id !== fileId), fileId];
  return mutate.invoke({
    expectedRevision: model.revision,
    idempotencyKey,
    mutation: {
      action: "update",
      ref,
      expectedVersion: target.expectedVersion ?? record.version,
      fields: [{ fieldId: target.fieldId, value: { kind: "file", value: ids } }],
    },
  });
}
