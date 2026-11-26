import type { FormEvent } from "react";
import type { RootStore } from "@/core/stores/root.store";
import type { EmailSignUpData } from "@/features/auth/sign-up-with-email.interactor";
import type { SignupRequest } from "@/features/acquisition/signup-source";

import { action, makeObservable, observable, toJS } from "mobx";
import { isRedirectError } from "next/dist/client/components/redirect-error";

import {
  continueWithGoogleAction,
  continueWithMicrosoftAction,
  requestMagicLinkAction,
  signUpWithEmailAction,
} from "../actions";

import { AuthMethodState } from "@/app/[locale]/(entry)/auth/signin/auth-method-state";
import { BaseFormStore } from "@/core/base/base-form.store";
import { toastZodErrorTree } from "@/core/utils/toast-zod-error-tree";
import { pathWithOnboardingIntent } from "@/features/company/onboarding-intent-url";

export class SignUpStore extends BaseFormStore<EmailSignUpData> {
  showPassword = false;
  readonly methods = new AuthMethodState();
  signupJourney: SignupRequest | null = null;

  constructor(rootStore: RootStore) {
    super(rootStore, { email: "", confirmEmail: "", password: "", confirmPassword: "", onboardingIntent: undefined });

    makeObservable(this, {
      showPassword: observable,
      signupJourney: observable.ref,

      onSubmit: action,
      requestMagicLink: action,
      continueWithProvider: action,
      toggleShowPassword: action,
      setSignupJourney: action,
    });
  }

  setSignupJourney = (journey: SignupRequest | null) => {
    this.signupJourney = journey;
  };

  private get journeyForAction(): SignupRequest | undefined {
    return this.form.onboardingIntent || !this.signupJourney ? undefined : toJS(this.signupJourney);
  }

  toggleShowPassword = () => {
    this.showPassword = !this.showPassword;
  };

  private get destination(): string {
    return this.form.onboardingIntent
      ? pathWithOnboardingIntent("/auth/invitation", this.form.onboardingIntent)
      : "/onboarding";
  }

  requestMagicLink = async () => {
    if (this.isLoading) return;

    this.setIsLoading(true);

    try {
      const data = { email: this.form.email, callbackURL: this.destination };
      const journey = this.journeyForAction;
      const res = journey ? await requestMagicLinkAction(data, journey) : await requestMagicLinkAction(data);

      if (res.ok) {
        this.setError(undefined);
        this.methods.markMagicLinkSent(res.data.email);
      } else this.setError(res.error);
    } finally {
      this.setIsLoading(false);
    }
  };

  onSubmit = async (event?: FormEvent<HTMLFormElement>) => {
    event?.preventDefault();
    if (this.methods.method === "magicLink") return this.requestMagicLink();
    this.setIsLoading(true);

    try {
      const journey = this.journeyForAction;
      const res = journey
        ? await signUpWithEmailAction(toJS(this.form), journey)
        : await signUpWithEmailAction(toJS(this.form));

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
      const callbackURL = this.destination;
      const errorCallbackURL = this.form.onboardingIntent
        ? pathWithOnboardingIntent("/auth/signup", this.form.onboardingIntent)
        : "/auth/signup";
      const journey = this.journeyForAction;
      const res = journey
        ? await action(callbackURL, errorCallbackURL, journey)
        : await action(callbackURL, errorCallbackURL);

      if (!res.ok) toastZodErrorTree(res.error);
    } catch (error) {
      if (!isRedirectError(error)) throw error;
      isNavigating = true;
    } finally {
      if (!isNavigating) this.setIsLoading(false);
    }
  };
}
