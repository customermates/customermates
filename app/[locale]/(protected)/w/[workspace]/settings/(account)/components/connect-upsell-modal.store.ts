import type { RootStore } from "@/core/stores/root.store";
import type { PurchasablePlanId } from "@/core/commercial/plan-catalog";

import { Resource } from "@/generated/prisma";

import { BaseModalStore } from "@/core/base/base-modal.store";

export class ConnectUpsellModalStore extends BaseModalStore<{
  message: string;
  plan: PurchasablePlanId;
}> {
  constructor(rootStore: RootStore) {
    super(rootStore, { message: "", plan: "business" }, Resource.inboxMessages);
  }
}
