import type { FormEvent } from "react";
import type { EmailSignInData } from "@/features/auth/sign-in-with-email.interactor";
import type { RootStore } from "@/core/stores/root.store";
import type { SignInEntry } from "./sign-in-entry";

import { action, makeObservable, observable, runInAction, toJS } from "mobx";
import { isRedirectError } from "next/dist/client/components/redirect-error";

import { resolveSignInEntryAction } from "./actions";

import {
  continueWithGoogleAction,
  continueWithMicrosoftAction,
  signInWithEmailAction,
} from "@/app/[locale]/(public)/auth/actions";
import { BaseFormStore } from "@/core/base/base-form.store";
import { reportApplicationError } from "@/core/errors/report-application-error";
import { toastZodErrorTree } from "@/core/utils/toast-zod-error-tree";
import { onboardingIntentFromPath, pathWithOnboardingIntent } from "@/features/company/onboarding-intent-url";

export class SignInStore extends BaseFormStore<EmailSignInData> {
  showPassword = false;
  entry: SignInEntry | null = null;
  entrySettled = false;
  private entryRequest: Promise<void> = Promise.resolve();

  constructor(rootStore: RootStore) {
    super(rootStore, { email: "", password: "", rememberMe: true, callbackURL: undefined });

    makeObservable(this, {
      showPassword: observable,
      entry: observable.ref,
      entrySettled: observable,

      onSubmit: action,
      continueWithProvider: action,
      toggleShowPassword: action,
      resolveEntry: action,
    });
  }

  toggleShowPassword = () => {
    this.showPassword = !this.showPassword;
  };

  resolveEntry = (search: string) => {
    this.entry = null;
    this.entrySettled = false;
    const request = resolveSignInEntryAction(search).then(
      (entry) => {
        if (this.entryRequest !== request) return;
        runInAction(() => {
          this.entry = entry;
          this.form.callbackURL = entry.callbackURL;
          this.entrySettled = true;
        });
      },
      (error: unknown) => {
        if (this.entryRequest !== request || isRedirectError(error)) return;
        runInAction(() => {
          this.entrySettled = true;
        });
        reportApplicationError(error);
      },
    );
    this.entryRequest = request;
  };

  onSubmit = async (event?: FormEvent<HTMLFormElement>) => {
    event?.preventDefault();
    if (this.isLoading) return;

    this.setIsLoading(true);
    let isNavigating = false;

    try {
      await this.entryRequest;
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
      await this.entryRequest;
      const action = provider === "google" ? continueWithGoogleAction : continueWithMicrosoftAction;
      const intent = onboardingIntentFromPath(this.form.callbackURL);
      const errorCallbackURL =
        intent.status === "valid" ? pathWithOnboardingIntent("/auth/signin", intent.intent) : "/auth/signin";
      const res = await action(this.form.callbackURL, errorCallbackURL);

      if (!res.ok) toastZodErrorTree(res.error);
    } catch (error) {
      if (!isRedirectError(error)) throw error;
      isNavigating = true;
    } finally {
      if (!isNavigating) this.setIsLoading(false);
    }
  };
}
