import type { RecordModelView } from "./record-model.schema";

export function recordChannelsEnabled(model: RecordModelView, typeId: string): boolean {
  return model.capabilities.some(
    (binding) => binding.kind === "channels" && binding.enabled !== false && binding.typeId === typeId,
  );
}
