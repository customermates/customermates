import type { FormEvent } from "react";
import type { RootStore } from "@/core/stores/root.store";
import type { RequestPasswordResetData } from "@/features/auth/request-password-reset.interactor";

import { action, makeObservable, observable, toJS } from "mobx";

import { BaseFormStore } from "@/core/base/base-form.store";
import { requestPasswordResetAction } from "@/app/[locale]/(public)/auth/actions";

export class ForgotPasswordStore extends BaseFormStore<RequestPasswordResetData> {
  sentTo: string | null = null;

  constructor(rootStore: RootStore) {
    super(rootStore, { email: "", confirmEmail: "", onboardingIntent: undefined });

    makeObservable(this, {
      sentTo: observable,
      setSentTo: action,
      onSubmit: action,
    });
  }

  setSentTo = (email: string | null) => {
    this.sentTo = email;
  };

  onSubmit = async (event?: FormEvent<HTMLFormElement>) => {
    event?.preventDefault();
    this.setIsLoading(true);

    try {
      const form = toJS(this.form);
      const res = await requestPasswordResetAction(form);
      if (res.ok) this.setSentTo(form.email.trim());
      else this.setError(res.error);
    } finally {
      this.setIsLoading(false);
    }
  };
}
