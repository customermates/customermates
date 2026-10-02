import type { RecordModel } from "./record-model.schema";

export function recordChannelsEnabled(model: RecordModel, typeId: string): boolean {
  return model.capabilities.some((binding) => binding.kind === "channels" && binding.enabled !== false && binding.typeId === typeId);
}
