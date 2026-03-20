import type { RootStore } from "@/core/stores/root.store";

import { action, makeObservable, observable } from "mobx";

import { createCheckoutSessionAction } from "@/app/[locale]/(protected)/company/actions";

export class SubscriptionExpiredCardStore {
  checkoutLoading = false;

  constructor(public readonly rootStore: RootStore) {
    makeObservable(this, {
      checkoutLoading: observable,
      handleSubscribe: action,
    });
  }

  handleSubscribe = async (): Promise<void> => {
    this.checkoutLoading = true;
    try {
      await createCheckoutSessionAction();
    } finally {
      this.checkoutLoading = false;
    }
  };
}
