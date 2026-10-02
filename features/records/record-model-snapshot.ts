import { RecordModelSchema, type RecordModel } from "./record-model.schema";

export function readRecordModelSnapshot(snapshot: unknown): RecordModel {
  if (typeof snapshot !== "object" || snapshot === null) return RecordModelSchema.parse(snapshot);
  const model = snapshot as { capabilities?: unknown };
  if (!Array.isArray(model.capabilities)) return RecordModelSchema.parse(snapshot);
  return RecordModelSchema.parse({
    ...snapshot,
    capabilities: model.capabilities.map((binding: unknown) =>
      typeof binding === "object" && binding !== null && "kind" in binding && binding.kind === "personIdentity"
        ? { ...binding, kind: "channels", enabled: true, providerAvatar: true }
        : binding,
    ),
  });
}
