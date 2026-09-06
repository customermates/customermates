import type { FormEvent } from "react";
import type { RootStore } from "@/core/stores/root.store";
import type { EmailSignUpData } from "@/features/auth/sign-up-with-email.interactor";

import { action, makeObservable, observable, toJS } from "mobx";

import { continueWithGoogleAction, continueWithMicrosoftAction, signUpWithEmailAction } from "../actions";

import { BaseFormStore } from "@/core/base/base-form.store";
import { toastZodErrorTree } from "@/core/utils/toast-zod-error-tree";
import { pathWithOnboardingIntent } from "@/features/company/onboarding-intent-url";

export class SignUpStore extends BaseFormStore<EmailSignUpData> {
  showPassword = false;

  constructor(rootStore: RootStore) {
    super(rootStore, { email: "", confirmEmail: "", password: "", confirmPassword: "", onboardingIntent: undefined });

    makeObservable(this, {
      showPassword: observable,

      onSubmit: action,
      continueWithProvider: action,
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
      const res = await signUpWithEmailAction(toJS(this.form));

      if (!res.ok) this.setError(res.error);
    } finally {
      this.setIsLoading(false);
    }
  };

  continueWithProvider = async (provider: "google" | "microsoft") => {
    if (this.isLoading) return;

    this.setIsLoading(true);
    let isNavigating = false;

    try {
      const action = provider === "google" ? continueWithGoogleAction : continueWithMicrosoftAction;
      const callbackURL = this.form.onboardingIntent
        ? pathWithOnboardingIntent("/auth/invitation", this.form.onboardingIntent)
        : "/onboarding";
      const errorCallbackURL = this.form.onboardingIntent
        ? pathWithOnboardingIntent("/auth/signup", this.form.onboardingIntent)
        : "/auth/signup";
      const res = await action(callbackURL, errorCallbackURL);

      if (!res.ok) toastZodErrorTree(res.error);
      else if (res.data.url) {
        window.location.assign(res.data.url);
        isNavigating = true;
      }
    } finally {
      if (!isNavigating) this.setIsLoading(false);
    }
  };
}
