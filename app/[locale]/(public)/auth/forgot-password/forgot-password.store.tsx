import type { FormEvent } from "react";
import type { RootStore } from "@/core/stores/root.store";
import type { RequestPasswordResetData } from "@/features/auth/request-password-reset.interactor";

import { action, makeObservable, toJS } from "mobx";

import { BaseFormStore } from "@/core/base/base-form.store";
import { requestPasswordResetAction } from "@/app/[locale]/(public)/auth/actions";

export class ForgotPasswordStore extends BaseFormStore<RequestPasswordResetData> {
  constructor(rootStore: RootStore) {
    super(rootStore, { email: "", confirmEmail: "", onboardingIntent: undefined });

    makeObservable(this, {
      onSubmit: action,
    });
  }

  onSubmit = async (event?: FormEvent<HTMLFormElement>) => {
    event?.preventDefault();
    this.setIsLoading(true);

    try {
      const res = await requestPasswordResetAction(toJS(this.form));
      if (res.ok) this.toastSuccess("ForgotPasswordForm.resetLinkSent");
      else this.setError(res.error);
    } finally {
      this.setIsLoading(false);
    }
  };
}
