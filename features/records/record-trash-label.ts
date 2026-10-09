import type { StoredRecord } from "./record.repo";
import type { RecordModel } from "./record-model.schema";

export function recordTrashLabel(row: Pick<StoredRecord, "typeId" | "values">, model: RecordModel): string {
  const primaryFieldId = model.types.find((type) => type.id === row.typeId)?.primaryFieldId;
  const value = row.values.find((candidate) => candidate.fieldId === primaryFieldId && candidate.state === "value");
  return value?.textValue ?? "";
}
