import type { RootStore } from "@/core/stores/root.store";
import type { SelectableOffer } from "@/app/[locale]/(protected)/w/[workspace]/settings/(workspace)/components/subscription/plan-picker";
import type { CheckoutState } from "@/ee/subscription/checkout-state";
import { BaseStore } from "@/core/base/base.store";

import { action, makeObservable, observable } from "mobx";

import {
  abandonCheckoutAction,
  createCheckoutSessionAction,
  getSubscriptionAction,
} from "@/app/[locale]/(protected)/w/[workspace]/settings/(workspace)/actions";
import { settingsHref } from "@/app/components/navigation/settings-routes";
import { isSubscriptionExpired } from "@/ee/subscription/entitlements";
import { notifyIfWorkspaceChanged } from "@/core/errors/workspace-changed-notice";
import { toastZodErrorTree } from "@/core/utils/toast-zod-error-tree";
import { buildLocalePath } from "@/i18n/locale-registry";
import { currentWorkspaceSlug } from "@/core/navigation/workspace-api-url";
import { withWorkspaceHref } from "@/core/navigation/workspace-paths";

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
      if (res.data.checkout === "started") {
        window.location.assign(res.data.url);
        return;
      }
      if (res.data.checkout === "pending") this.setCheckout("pending");
      else await this.refreshCheckout();
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
    const result = await getSubscriptionAction();
    if (!result.ok) {
      if (notifyIfWorkspaceChanged(result)) return;
      throw new Error("Subscription could not be loaded");
    }
    const subscription = result.data;
    if (isSubscriptionExpired(subscription)) {
      this.setCheckout(subscription.checkout);
      return;
    }
    this.setActivated(true);
    this.rootStore.navigationGuard.navigateDocument(
      withWorkspaceHref(
        buildLocalePath(this.rootStore.localeStore.locale, settingsHref("billing")),
        currentWorkspaceSlug(),
      ),
    );
  };
}
