import type { RecordModelView } from "./record-model.schema";

export function recordChannelsBinding(model: RecordModelView, typeId: string) {
  return model.capabilities.find((binding) => binding.kind === "channels" && binding.typeId === typeId);
}

export function recordChannelsEnabled(model: RecordModelView, typeId: string): boolean {
  const binding = recordChannelsBinding(model, typeId);
  return Boolean(binding) && binding?.enabled !== false;
}
