import type { FormEvent } from "react";
import type { RootStore } from "@/core/stores/root.store";
import type { RegisterOnboardingProfileData } from "@/features/user/register/register-onboarding-profile.interactor";

import { action, makeObservable, toJS } from "mobx";
import { CountryCode } from "@/generated/prisma";

import { registerProfileAction } from "../actions";

import { BaseFormStore } from "@/core/base/base-form.store";

export class StepProfileStore extends BaseFormStore<RegisterOnboardingProfileData & { websiteUrl: string }> {
  constructor(rootStore: RootStore) {
    super(rootStore, {
      firstName: "",
      lastName: "",
      country: CountryCode.de,
      avatarUrl: null,
      email: "",
      agreeToTerms: false,
      onboardingIntent: undefined,
      websiteUrl: "",
    });

    makeObservable(this, {
      onSubmit: action,
    });
  }

  onSubmit = async (event?: FormEvent<HTMLFormElement>) => {
    event?.preventDefault();
    this.setIsLoading(true);

    try {
      const { firstName, lastName, country, avatarUrl, email, agreeToTerms, onboardingIntent } = toJS(this.form);
      const res = await registerProfileAction({
        firstName,
        lastName,
        country,
        avatarUrl,
        email,
        agreeToTerms,
        onboardingIntent,
      });

      if (!res.ok) this.setError(res.error);
      else this.setError(undefined);
    } finally {
      this.setIsLoading(false);
    }
  };
}
