import type { ConfigurationChange } from "@/features/records/configuration.schema";
import type { RecordModelView } from "@/features/records/record-model.schema";

import { recordChannelsBinding } from "@/features/records/record-channels";

export function channelsFieldOperations(
  model: RecordModelView,
  typeId: string,
  form: { providerAvatar: boolean },
  newBindingId: string,
): ConfigurationChange["operations"] {
  const binding = recordChannelsBinding(model, typeId);
  return [
    {
      operation: "putCapability",
      capability: {
        ...(binding ?? { id: newBindingId, fields: [] }),
        kind: "channels",
        typeId,
        enabled: true,
        providerAvatar: form.providerAvatar,
      },
    },
  ];
}

export function channelsAvatarAvailable(model: RecordModelView, typeId: string) {
  return model.capabilities.some((binding) => binding.kind === "avatar" && binding.typeId === typeId);
}
