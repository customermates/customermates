import type { FormEvent } from "react";
import type { RootStore } from "@/core/stores/root.store";
import type { RegisterOnboardingProfileData } from "@/features/user/register/register-onboarding-profile.interactor";

import { action, makeObservable, observable, toJS } from "mobx";
import { Locale } from "@/generated/prisma";

import { registerProfileAction } from "../actions";

import { BaseFormStore } from "@/core/base/base-form.store";
import { parseTeamSize } from "@/features/onboarding-funnel/team-size";
import {
  DISCOVERY_DETAIL_MAX_LENGTH,
  parseDiscoveryChoice,
  type DiscoveryChoice,
} from "@/features/onboarding-funnel/discovery-answer";

export class StepProfileStore extends BaseFormStore<RegisterOnboardingProfileData> {
  requiresTeamSize = false;
  teamSizeMissing = false;
  asksDiscovery = false;
  discovery: DiscoveryChoice | null = null;
  discoveryDetail = "";
  languageOpen = false;

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
      asksDiscovery: observable,
      discovery: observable,
      discoveryDetail: observable,
      languageOpen: observable,
      setOwnerQuestions: action,
      setTeamSize: action,
      setDiscovery: action,
      setDiscoveryDetail: action,
      openLanguage: action,
      onSubmit: action,
    });
  }

  setOwnerQuestions = (asked: boolean) => {
    this.requiresTeamSize = asked;
    this.asksDiscovery = asked;
    if (!asked) this.teamSizeMissing = false;
  };

  setTeamSize = (value: string) => {
    const teamSize = parseTeamSize(value);
    if (!teamSize) return;
    this.onChange("teamSize", teamSize);
    this.teamSizeMissing = false;
  };

  setDiscovery = (value: string) => {
    this.discovery = parseDiscoveryChoice(value);
  };

  setDiscoveryDetail = (value: string) => {
    this.discoveryDetail = value.slice(0, DISCOVERY_DETAIL_MAX_LENGTH);
  };

  openLanguage = () => {
    this.languageOpen = true;
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
      const discovery = this.asksDiscovery
        ? { choice: this.discovery, ...(this.discovery === "other" ? { detail: this.discoveryDetail } : {}) }
        : undefined;
      const res = await registerProfileAction(this.requiresTeamSize ? form : { ...form, teamSize: null }, discovery);

      if (!res.ok) this.setError(res.error);
      else this.setError(undefined);
    } finally {
      this.setIsLoading(false);
    }
  };
}
