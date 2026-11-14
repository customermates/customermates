import type { FormEvent } from "react";
import type { RootStore } from "@/core/stores/root.store";
import type { RegisterOnboardingProfileData } from "@/features/user/register/register-onboarding-profile.interactor";

import { action, makeObservable, observable, toJS } from "mobx";
import { Locale } from "@/generated/prisma";

import { registerProfileAction } from "../actions";

import { BaseFormStore } from "@/core/base/base-form.store";
import { parseTeamSize } from "@/features/onboarding-funnel/team-size";

export class StepProfileStore extends BaseFormStore<RegisterOnboardingProfileData> {
  requiresTeamSize = false;
  teamSizeMissing = false;

  constructor(rootStore: RootStore) {
    super(rootStore, {
      firstName: "",
      lastName: "",
      displayLanguage: Locale.system,
      avatarUrl: null,
      email: "",
      agreeToTerms: false,
      workspaceName: "",
      teamSize: null,
      onboardingIntent: undefined,
    });

    makeObservable(this, {
      requiresTeamSize: observable,
      teamSizeMissing: observable,
      setRequiresTeamSize: action,
      setTeamSize: action,
      onSubmit: action,
    });
  }

  setRequiresTeamSize = (required: boolean) => {
    this.requiresTeamSize = required;
    if (!required) this.teamSizeMissing = false;
  };

  setTeamSize = (value: string) => {
    const teamSize = parseTeamSize(value);
    if (!teamSize) return;
    this.onChange("teamSize", teamSize);
    this.teamSizeMissing = false;
  };

  onSubmit = async (event?: FormEvent<HTMLFormElement>) => {
    event?.preventDefault();
    if (this.requiresTeamSize && !this.form.teamSize) {
      this.teamSizeMissing = true;
      return;
    }
    this.setIsLoading(true);

    try {
      const form = toJS(this.form);
      const res = await registerProfileAction(this.requiresTeamSize ? form : { ...form, teamSize: null });

      if (!res.ok) this.setError(res.error);
      else this.setError(undefined);
    } finally {
      this.setIsLoading(false);
    }
  };
}
