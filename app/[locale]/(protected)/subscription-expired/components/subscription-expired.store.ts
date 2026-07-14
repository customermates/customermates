import type { RootStore } from "@/core/stores/root.store";
import type { SelectablePlan } from "@/app/[locale]/(protected)/company/components/subscription/plan-picker";
import { BaseStore } from "@/core/base/base.store";

import { action, makeObservable } from "mobx";

import { createCheckoutSessionAction } from "@/app/[locale]/(protected)/company/actions";
import { toastZodErrorTree } from "@/core/utils/toast-zod-error-tree";

export class SubscriptionExpiredStore extends BaseStore {
  constructor(rootStore: RootStore) {
    super(rootStore);
    makeObservable(this, {
      handleSubscribe: action,
    });
  }

  handleSubscribe = async (plan: SelectablePlan): Promise<void> => {
    await this.rootStore.loadingOverlayStore.withLoading(async () => {
      const res = await createCheckoutSessionAction({ plan });
      if (!res.ok) {
        toastZodErrorTree(res.error);
        return;
      }
      window.location.assign(res.data.url);
    });
  };
}
