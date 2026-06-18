import type { RootStore } from "@/core/stores/root.store";
import { BaseStore } from "@/core/base/base.store";
import type { SubscriptionDto } from "@/ee/subscription/get-subscription.interactor";

import { action, makeObservable, observable } from "mobx";

import { createCheckoutSessionAction, refreshSubscriptionAction, getSubscriptionAction } from "../../actions";

export class SubscriptionStore extends BaseStore {
  subscription: SubscriptionDto | null = null;

  constructor(rootStore: RootStore) {
    super(rootStore);
    makeObservable(this, {
      subscription: observable,
      handleSubscribe: action,
      handleRefresh: action,
      setSubscription: action,
    });
  }

  setSubscription = (subscription: SubscriptionDto | null) => {
    this.subscription = subscription;
  };

  handleSubscribe = async (): Promise<void> => {
    await this.rootStore.loadingOverlayStore.withLoading(async () => {
      await createCheckoutSessionAction();
    });
  };

  handleRefresh = async (): Promise<void> => {
    await this.rootStore.loadingOverlayStore.withLoading(async () => {
      await refreshSubscriptionAction();
      const subscription = await getSubscriptionAction();
      this.setSubscription(subscription);

      this.toastSuccess("subscription.refreshSuccess");
    });
  };
}
