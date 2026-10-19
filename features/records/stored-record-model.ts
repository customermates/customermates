import { RecordModelSchema, type RecordModel } from "./record-model.schema";

const RETIRED_CAPABILITY_KINDS = new Set(["membershipAuthorization"]);

function isRetiredCapability(capability: unknown): boolean {
  return (
    typeof capability === "object" &&
    capability !== null &&
    "kind" in capability &&
    typeof capability.kind === "string" &&
    RETIRED_CAPABILITY_KINDS.has(capability.kind)
  );
}

export function parseStoredRecordModel(snapshot: unknown): RecordModel {
  if (typeof snapshot !== "object" || snapshot === null || !("capabilities" in snapshot))
    return RecordModelSchema.parse(snapshot);

  const { capabilities } = snapshot;
  return RecordModelSchema.parse(
    Array.isArray(capabilities)
      ? { ...snapshot, capabilities: capabilities.filter((capability) => !isRetiredCapability(capability)) }
      : snapshot,
  );
}
