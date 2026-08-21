import type { FormEvent } from "react";
import type { EmailSignInData } from "@/features/auth/sign-in-with-email.interactor";
import type { RootStore } from "@/core/stores/root.store";

import { action, makeObservable, observable, toJS } from "mobx";

import { continueWithGoogleAction, continueWithMicrosoftAction, signInWithEmailAction } from "../actions";

import { BaseFormStore } from "@/core/base/base-form.store";
import { toastZodErrorTree } from "@/core/utils/toast-zod-error-tree";

export class SignInStore extends BaseFormStore<EmailSignInData> {
  callbackURL?: string;
  showPassword = false;

  constructor(rootStore: RootStore) {
    super(rootStore, { email: "", password: "", rememberMe: true });

    makeObservable(this, {
      showPassword: observable,
      callbackURL: observable,

      onSubmit: action,
      continueWithProvider: action,
      toggleShowPassword: action,
      setCallbackURL: action,
    });
  }

  setCallbackURL = (callbackURL?: string) => {
    this.callbackURL = callbackURL;
  };

  toggleShowPassword = () => {
    this.showPassword = !this.showPassword;
  };

  onSubmit = async (event?: FormEvent<HTMLFormElement>) => {
    event?.preventDefault();
    if (this.isLoading) return;

    this.setIsLoading(true);
    let isNavigating = false;

    try {
      const res = await signInWithEmailAction({
        ...toJS(this.form),
        callbackURL: this.callbackURL,
      });

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
      const res = await action(this.callbackURL, "/auth/signin");

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
