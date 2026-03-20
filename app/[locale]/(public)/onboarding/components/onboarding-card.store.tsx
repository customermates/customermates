import type { FormEvent } from "react";
import type { RegisterUserData } from "@/features/user/register/register-user.interactor";
import type { RootStore } from "@/core/stores/root.store";

import { action, makeObservable, toJS } from "mobx";
import { CountryCode } from "@/generated/prisma";

import { onboardingAction } from "../actions";

import { BaseFormStore } from "@/core/base/base-form.store";

export class OnboardingCardStore extends BaseFormStore<RegisterUserData> {
  constructor(public readonly rootStore: RootStore) {
    super(rootStore, {
      firstName: "",
      lastName: "",
      country: CountryCode.de,
      avatarUrl: null,
      email: "",
      agreeToTerms: false,
      marketingEmails: false,
    });

    makeObservable(this, {
      onSubmit: action,
    });
  }

  onSubmit = async (event?: FormEvent<HTMLFormElement>) => {
    event?.preventDefault();
    this.setIsLoading(true);

    try {
      const res = await onboardingAction(toJS(this.form));

      if (!res.ok) this.setError(res.error);
      else this.setError(undefined);
    } finally {
      this.setIsLoading(false);
    }
  };
}
