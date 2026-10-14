import type { RootStore } from "@/core/stores/root.store";

import { Resource } from "@/generated/prisma";

import { BaseModalStore } from "@/core/base/base-modal.store";

export class ConnectUpsellModalStore extends BaseModalStore<{
  message: string;
}> {
  constructor(rootStore: RootStore) {
    super(rootStore, { message: "" }, Resource.inboxMessages);
  }
}
