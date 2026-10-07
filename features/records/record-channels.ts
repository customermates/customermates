import type { RecordModel } from "./record-model.schema";

export function recordChannelsBinding(model: RecordModel, typeId: string) {
  return model.capabilities.find((binding) => binding.kind === "channels" && binding.typeId === typeId);
}

export function recordChannelsEnabled(model: RecordModel, typeId: string): boolean {
  const binding = recordChannelsBinding(model, typeId);
  return Boolean(binding) && binding?.enabled !== false;
}
