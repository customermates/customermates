import type { FormEvent } from "react";
import type { RegisterUserData } from "@/features/user/register/register-user.interactor";
import type { RootStore } from "@/core/stores/root.store";

import { action, makeObservable, observable, toJS } from "mobx";
import { CountryCode } from "@/generated/prisma";

import { registerProfileAction } from "../actions";

import { BaseFormStore } from "@/core/base/base-form.store";

export class StepProfileStore extends BaseFormStore<RegisterUserData> {
  onboardingIntent?: string;

  constructor(rootStore: RootStore) {
    super(rootStore, {
      firstName: "",
      lastName: "",
      country: CountryCode.de,
      avatarUrl: null,
      email: "",
      agreeToTerms: false,
    });

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
      const res = await registerProfileAction(toJS(this.form), this.onboardingIntent);

      if (!res.ok) this.setError(res.error);
      else this.setError(undefined);
    } finally {
      this.setIsLoading(false);
    }
  };
}
