import type { ConfigurationChange } from "@/features/records/configuration.schema";
import type { RecordModel } from "@/features/records/record-model.schema";

import { recordChannelsBinding } from "@/features/records/record-channels";

export function channelsFieldOperations(
  model: RecordModel,
  typeId: string,
  form: { archived: boolean; providerAvatar: boolean },
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
        enabled: !form.archived,
        providerAvatar: form.providerAvatar,
      },
    },
  ];
}

export function channelsAvatarAvailable(model: RecordModel, typeId: string) {
  return model.capabilities.some((binding) => binding.kind === "avatar" && binding.typeId === typeId);
}
