import type { FormEvent } from "react";
import type { RootStore } from "@/core/stores/root.store";
import type { ResetPasswordData } from "@/features/auth/reset-password.interactor";

import { action, makeObservable, observable, toJS } from "mobx";

import { resetPasswordAction } from "../actions";

import { BaseFormStore } from "@/core/base/base-form.store";

export class ResetPasswordStore extends BaseFormStore<ResetPasswordData> {
  showPassword = false;

  constructor(rootStore: RootStore) {
    super(rootStore, { password: "", confirmPassword: "", token: "", onboardingIntent: undefined });

    makeObservable(this, {
      showPassword: observable,
      onSubmit: action,
      toggleShowPassword: action,
    });
  }

  toggleShowPassword = () => {
    this.showPassword = !this.showPassword;
  };

  onSubmit = async (event?: FormEvent<HTMLFormElement>) => {
    event?.preventDefault();
    this.setIsLoading(true);

    try {
      const res = await resetPasswordAction(toJS(this.form));

      if (!res.ok) this.setError(res.error);
    } finally {
      this.setIsLoading(false);
    }
  };
}
