import type { FormEvent } from "react";
import type { EmailSignInData } from "@/features/auth/sign-in-with-email.interactor";
import type { RootStore } from "@/core/stores/root.store";

import { action, makeObservable, observable, toJS } from "mobx";

import { continueWithGoogleAction, continueWithMicrosoftAction, signInWithEmailAction } from "../actions";

import { BaseFormStore } from "@/core/base/base-form.store";
import { toastZodErrorTree } from "@/core/utils/toast-zod-error-tree";
import { onboardingIntentFromPath, pathWithOnboardingIntent } from "@/features/company/onboarding-intent-url";

export class SignInStore extends BaseFormStore<EmailSignInData> {
  showPassword = false;

  constructor(rootStore: RootStore) {
    super(rootStore, { email: "", password: "", rememberMe: true, callbackURL: undefined });

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
    if (this.isLoading) return;

    this.setIsLoading(true);
    let isNavigating = false;

    try {
      const res = await signInWithEmailAction(toJS(this.form));

      if (res.ok) {
        window.location.assign(res.data.url);
        isNavigating = true;
      } else this.setError(res.error);
    } finally {
      if (!isNavigating) this.setIsLoading(false);
    }
  };

  continueWithProvider = async (provider: "google" | "microsoft") => {
    if (this.isLoading) return;

    this.setIsLoading(true);
    let isNavigating = false;

    try {
      const action = provider === "google" ? continueWithGoogleAction : continueWithMicrosoftAction;
      const intent = onboardingIntentFromPath(this.form.callbackURL);
      const errorCallbackURL =
        intent.status === "valid" ? pathWithOnboardingIntent("/auth/signin", intent.intent) : "/auth/signin";
      const res = await action(this.form.callbackURL, errorCallbackURL);

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
