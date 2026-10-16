import type { RootStore } from "@/core/stores/root.store";
import type { SelectableOffer } from "@/app/[locale]/(protected)/settings/(workspace)/components/subscription/plan-picker";
import type { CheckoutState } from "@/ee/subscription/checkout-state";
import { BaseStore } from "@/core/base/base.store";

import { action, makeObservable, observable } from "mobx";

import {
  abandonCheckoutAction,
  createCheckoutSessionAction,
  getSubscriptionAction,
} from "@/app/[locale]/(protected)/settings/(workspace)/actions";
import { settingsHref } from "@/app/components/navigation/settings-routes";
import { isSubscriptionExpired } from "@/ee/subscription/entitlements";
import { toastZodErrorTree } from "@/core/utils/toast-zod-error-tree";
import { buildLocalePath } from "@/i18n/locale-registry";

export class SubscriptionExpiredStore extends BaseStore {
  checkout: CheckoutState | null = null;
  activated = false;

  constructor(rootStore: RootStore) {
    super(rootStore);
    makeObservable(this, {
      checkout: observable,
      activated: observable,
      setCheckout: action,
      setActivated: action,
      handleSubscribe: action,
      handleAbandon: action,
    });
  }

  setCheckout = (checkout: CheckoutState | null) => {
    this.checkout = checkout;
  };

  setActivated = (activated: boolean) => {
    this.activated = activated;
  };

  handleSubscribe = async (offer: SelectableOffer): Promise<void> => {
    await this.rootStore.loadingOverlayStore.withLoading(async () => {
      const res = await createCheckoutSessionAction(offer);
      if (!res.ok) {
        toastZodErrorTree(res.error);
        return;
      }
      if (res.data.checkout === "pending") {
        this.setCheckout("pending");
        return;
      }
      window.location.assign(res.data.url);
    });
  };

  handleAbandon = async (): Promise<void> => {
    await this.rootStore.loadingOverlayStore.withLoading(async () => {
      const res = await abandonCheckoutAction();
      if (!res.ok) {
        toastZodErrorTree(res.error);
        return;
      }
      this.setCheckout("none");
    });
  };

  refreshCheckout = async (): Promise<void> => {
    if (this.activated) return;
    const subscription = await getSubscriptionAction();
    if (isSubscriptionExpired(subscription)) {
      this.setCheckout(subscription.checkout);
      return;
    }
    this.setActivated(true);
    this.rootStore.navigationGuard.navigateDocument(
      buildLocalePath(this.rootStore.localeStore.locale, settingsHref("billing")),
    );
  };
}
