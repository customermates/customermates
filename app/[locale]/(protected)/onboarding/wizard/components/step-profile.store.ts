import type { FormEvent } from "react";
import type { RootStore } from "@/core/stores/root.store";
import type { RegisterOnboardingProfileData } from "@/features/user/register/register-onboarding-profile.interactor";

import { action, makeObservable, toJS } from "mobx";
import { Locale } from "@/generated/prisma";

import { registerProfileAction } from "../actions";

import { BaseFormStore } from "@/core/base/base-form.store";

export class StepProfileStore extends BaseFormStore<RegisterOnboardingProfileData> {
  constructor(rootStore: RootStore) {
    super(rootStore, {
      firstName: "",
      lastName: "",
      displayLanguage: Locale.system,
      avatarUrl: null,
      email: "",
      agreeToTerms: false,
      workspaceName: "",
      onboardingIntent: undefined,
    });

    makeObservable(this, {
      onSubmit: action,
    });
  }

  onSubmit = async (event?: FormEvent<HTMLFormElement>) => {
    event?.preventDefault();
    this.setIsLoading(true);

    try {
      const res = await registerProfileAction(toJS(this.form));

      if (!res.ok) this.setError(res.error);
      else this.setError(undefined);
    } finally {
      this.setIsLoading(false);
    }
  };
}
