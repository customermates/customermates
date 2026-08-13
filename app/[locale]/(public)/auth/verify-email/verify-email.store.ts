import type { RootStore } from "@/core/stores/root.store";

import { action, makeObservable, observable, runInAction } from "mobx";

import { BaseStore } from "@/core/base/base.store";
import { resendVerificationEmailFromAuthAction } from "@/app/[locale]/(public)/auth/actions";

export class VerifyEmailStore extends BaseStore {
  isSent = false;
  private activeEmail: string | undefined;

  constructor(rootStore: RootStore) {
    super(rootStore);

    makeObservable(this, {
      isSent: observable,
      activate: action,
      deactivate: action,
      resend: action,
    });
  }

  activate = (email: string | undefined): void => {
    if (this.activeEmail === email && email !== undefined) return;
    this.activeEmail = email;
    this.isSent = false;
  };

  deactivate = (email: string | undefined): void => {
    if (this.activeEmail !== email) return;
    this.activeEmail = undefined;
    this.isSent = false;
  };

  resend = async (): Promise<void> => {
    const email = this.activeEmail;
    if (!email) return;

    await this.rootStore.loadingOverlayStore.withLoading(async () => {
      const result = await resendVerificationEmailFromAuthAction();
      if (!result.ok || this.activeEmail !== email) return;

      runInAction(() => {
        this.isSent = true;
      });
      this.toastSuccess("VerifyEmailCard.resendSuccess");
    });
  };
}
