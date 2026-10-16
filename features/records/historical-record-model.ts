import type { RecordValueType } from "./record-model.schema";

const RETIRED_VALUE_TYPES = new Map<string, RecordValueType>([["phone", "text"]]);

type JsonObject = Record<string, unknown>;

function isObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readableField(field: unknown): unknown {
  if (!isObject(field) || typeof field.valueType !== "string") return field;
  const valueType = RETIRED_VALUE_TYPES.get(field.valueType);
  return valueType ? { ...field, valueType } : field;
}

export function historicalRecordModel(snapshot: unknown): unknown {
  return isObject(snapshot) && Array.isArray(snapshot.fields)
    ? { ...snapshot, fields: snapshot.fields.map(readableField) }
    : snapshot;
}

export function historicalRevisionChange(change: unknown): unknown {
  if (!isObject(change) || !isObject(change.configuration) || !Array.isArray(change.configuration.operations))
    return change;
  return {
    ...change,
    configuration: {
      ...change.configuration,
      operations: change.configuration.operations.map((operation) =>
        isObject(operation) && operation.operation === "putField"
          ? { ...operation, field: readableField(operation.field) }
          : operation,
      ),
    },
  };
}
