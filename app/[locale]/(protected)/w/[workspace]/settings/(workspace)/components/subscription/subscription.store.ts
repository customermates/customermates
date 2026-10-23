import type { RootStore } from "@/core/stores/root.store";
import { BaseStore } from "@/core/base/base.store";
import type { SubscriptionDto } from "@/ee/subscription/get-subscription.interactor";
import type { SelectableOffer } from "./plan-picker";

import { action, makeObservable, observable } from "mobx";

import {
  abandonCheckoutAction,
  createCheckoutSessionAction,
  refreshSubscriptionAction,
  getSubscriptionAction,
  getBillingPortalUrlAction,
} from "../../actions";
import { notifyIfWorkspaceChanged } from "@/core/errors/workspace-changed-notice";
import { toastZodErrorTree } from "@/core/utils/toast-zod-error-tree";

export class SubscriptionStore extends BaseStore {
  subscription: SubscriptionDto | null = null;

  constructor(rootStore: RootStore) {
    super(rootStore);
    makeObservable(this, {
      subscription: observable,
      handleSubscribe: action,
      handleAbandon: action,
      handleManageBilling: action,
      handleRefresh: action,
      setSubscription: action,
    });
  }

  setSubscription = (subscription: SubscriptionDto | null) => {
    this.subscription = subscription;
  };

  reloadSubscription = async (): Promise<void> => {
    const subscription = await getSubscriptionAction();
    if (!subscription.ok) {
      if (notifyIfWorkspaceChanged(subscription)) return;
      throw new Error("Subscription could not be loaded");
    }
    this.setSubscription(subscription.data);
  };

  handleSubscribe = async (offer: SelectableOffer): Promise<void> => {
    await this.rootStore.loadingOverlayStore.withLoading(async () => {
      const res = await createCheckoutSessionAction(offer);
      if (!res.ok) {
        toastZodErrorTree(res.error);
        return;
      }
      if (res.data.checkout !== "started") {
        await this.reloadSubscription();
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
      await this.reloadSubscription();
    });
  };

  handleManageBilling = async (): Promise<void> => {
    await this.rootStore.loadingOverlayStore.withLoading(async () => {
      const res = await getBillingPortalUrlAction();
      if (!res.ok) {
        toastZodErrorTree(res.error);
        return;
      }
      window.location.assign(res.data.url);
    });
  };

  handleRefresh = async (): Promise<void> => {
    await this.rootStore.loadingOverlayStore.withLoading(async () => {
      const res = await refreshSubscriptionAction();
      if (!res.ok) {
        toastZodErrorTree(res.error);
        return;
      }

      await this.reloadSubscription();
      this.toastSuccess("Subscription.refreshSuccess");
    });
  };
}
