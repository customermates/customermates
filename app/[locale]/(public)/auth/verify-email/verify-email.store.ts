import type { RootStore } from "@/core/stores/root.store";

import { action, makeObservable, observable, runInAction } from "mobx";

import { BaseStore } from "@/core/base/base.store";
import { resendVerificationEmailFromAuthAction } from "@/app/[locale]/(public)/auth/actions";

export class VerifyEmailStore extends BaseStore {
  isSent = false;

  constructor(rootStore: RootStore) {
    super(rootStore);

    makeObservable(this, {
      isSent: observable,
      resend: action,
    });
  }

  resend = async (): Promise<void> => {
    await this.rootStore.loadingOverlayStore.withLoading(async () => {
      const result = await resendVerificationEmailFromAuthAction();
      if (!result.ok) return;

      runInAction(() => {
        this.isSent = true;
      });
      this.toastSuccess("VerifyEmailCard.resendSuccess");
    });
  };
}
