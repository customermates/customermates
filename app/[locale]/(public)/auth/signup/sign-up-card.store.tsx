import type { FormEvent } from "react";
import type { RootStore } from "@/core/stores/root.store";
import type { EmailSignUpData } from "@/features/auth/sign-up-with-email.interactor";

import { action, makeObservable, observable, toJS } from "mobx";
import { addToast } from "@heroui/toast";

import { signUpWithEmailAction } from "../actions";

import { BaseFormStore } from "@/core/base/base-form.store";

export class SignUpCardStore extends BaseFormStore<EmailSignUpData> {
  showPassword = false;

  constructor(public readonly rootStore: RootStore) {
    super(rootStore, { email: "", confirmEmail: "", password: "", confirmPassword: "" });

    makeObservable(this, {
      showPassword: observable,

      onSubmit: action,
      toggleShowPassword: action,
    });
  }

  toggleShowPassword = () => {
    this.showPassword = !this.showPassword;
  };

  onSubmit = async (event?: FormEvent<HTMLFormElement>) => {
    event?.preventDefault();
    this.setIsLoading(true);

    try {
      const res = await signUpWithEmailAction(toJS(this.form));

      if (!res.ok) {
        this.setError(res.error);
        if (res.error?.errors?.[0]) addToast({ description: res.error.errors?.[0], color: "danger" });
      }
    } finally {
      this.setIsLoading(false);
    }
  };
}
