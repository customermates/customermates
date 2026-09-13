import type { FormEvent } from "react";
import type { RootStore } from "@/core/stores/root.store";

import { action, makeObservable, observable, runInAction } from "mobx";

import { BaseFormStore } from "@/core/base/base-form.store";
import { resendVerificationEmailFromAuthAction } from "@/app/[locale]/(public)/auth/actions";

type VerifyEmailForm = {
  email: string;
};

export class VerifyEmailStore extends BaseFormStore<VerifyEmailForm> {
  isSent = false;
  private activeEmail: string | undefined;
  private onboardingIntent: string | undefined;

  constructor(rootStore: RootStore) {
    super(rootStore, { email: "" });

    makeObservable(this, {
      isSent: observable,
      activate: action,
      deactivate: action,
      resend: action,
    });

    this.setWithUnsavedChangesGuard(false);
  }

  activate = (email: string | undefined, onboardingIntent?: string): void => {
    if (this.activeEmail === email && this.onboardingIntent === onboardingIntent && email !== undefined) return;
    this.activeEmail = email;
    this.onboardingIntent = onboardingIntent;
    this.isSent = false;
  };

  deactivate = (email: string | undefined): void => {
    if (this.activeEmail !== email) return;
    this.activeEmail = undefined;
    this.onboardingIntent = undefined;
    this.isSent = false;
  };

  onSubmit = async (event?: FormEvent<HTMLFormElement>): Promise<void> => {
    event?.preventDefault();
    await this.resend();
  };

  resend = async (): Promise<void> => {
    const sessionEmail = this.activeEmail;
    const email = sessionEmail ?? this.form.email.trim();
    if (!email) return;

    await this.rootStore.loadingOverlayStore.withLoading(async () => {
      const result = await resendVerificationEmailFromAuthAction({
        onboardingIntent: this.onboardingIntent,
        email: sessionEmail ? undefined : email,
      });
      if (!result.ok || this.activeEmail !== sessionEmail) return;

      runInAction(() => {
        this.isSent = true;
      });
      this.toastSuccess("VerifyEmailCard.resendSuccess");
    });
  };
}
