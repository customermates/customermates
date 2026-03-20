import type { RootStore } from "@/core/stores/root.store";
import type { SubscriptionDto } from "@/ee/subscription/get-subscription.interactor";

import { action, makeObservable, observable } from "mobx";
import { addToast } from "@heroui/toast";

import { createCheckoutSessionAction, refreshSubscriptionAction, getSubscriptionAction } from "../../actions";

export class SubscriptionCardStore {
  checkoutLoading = false;
  refreshLoading = false;
  subscription: SubscriptionDto | null = null;

  constructor(public readonly rootStore: RootStore) {
    makeObservable(this, {
      checkoutLoading: observable,
      refreshLoading: observable,
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
    this.checkoutLoading = true;
    try {
      await createCheckoutSessionAction();
    } finally {
      this.checkoutLoading = false;
    }
  };

  handleRefresh = async (): Promise<void> => {
    this.refreshLoading = true;
    try {
      await refreshSubscriptionAction();
      const subscription = await getSubscriptionAction();
      this.setSubscription(subscription);

      addToast({
        description: this.rootStore.localeStore.getTranslation("subscription.refreshSuccess"),
        color: "success",
      });
    } finally {
      this.refreshLoading = false;
    }
  };
}
