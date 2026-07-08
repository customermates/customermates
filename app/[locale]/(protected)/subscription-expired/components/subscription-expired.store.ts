import type { RootStore } from "@/core/stores/root.store";
import { BaseStore } from "@/core/base/base.store";

import { action, makeObservable } from "mobx";

import { createCheckoutSessionAction } from "@/app/[locale]/(protected)/company/actions";

export class SubscriptionExpiredStore extends BaseStore {
  constructor(rootStore: RootStore) {
    super(rootStore);
    makeObservable(this, {
      handleSubscribe: action,
    });
  }

  handleSubscribe = async (): Promise<void> => {
    await this.rootStore.loadingOverlayStore.withLoading(async () => {
      const res = await createCheckoutSessionAction();
      window.location.assign(res.data.url);
    });
  };
}
