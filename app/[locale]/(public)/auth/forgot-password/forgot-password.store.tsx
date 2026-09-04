import type { FormEvent } from "react";
import type { RootStore } from "@/core/stores/root.store";
import type { RequestPasswordResetData } from "@/features/auth/request-password-reset.interactor";

import { action, makeObservable, observable, toJS } from "mobx";

import { BaseFormStore } from "@/core/base/base-form.store";
import { requestPasswordResetAction } from "@/app/[locale]/(public)/auth/actions";

export class ForgotPasswordStore extends BaseFormStore<RequestPasswordResetData> {
  onboardingIntent?: string;

  constructor(rootStore: RootStore) {
    super(rootStore, { email: "", confirmEmail: "" });

    makeObservable(this, {
      onboardingIntent: observable,
      onSubmit: action,
      setOnboardingIntent: action,
    });
  }

  setOnboardingIntent = (onboardingIntent?: string) => {
    this.onboardingIntent = onboardingIntent;
  };

  onSubmit = async (event?: FormEvent<HTMLFormElement>) => {
    event?.preventDefault();
    this.setIsLoading(true);

    try {
      const res = await requestPasswordResetAction(toJS(this.form), this.onboardingIntent);
      if (res.ok) this.toastSuccess("ForgotPasswordForm.resetLinkSent");
      else this.setError(res.error);
    } finally {
      this.setIsLoading(false);
    }
  };
}
