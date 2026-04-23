import type { FormEvent } from "react";
import type { EmailSignInData } from "@/features/auth/sign-in-with-email.interactor";
import type { RootStore } from "@/core/stores/root.store";

import { action, makeObservable, observable, toJS } from "mobx";

import { signInWithEmailAction } from "../actions";

import { BaseFormStore } from "@/core/base/base-form.store";

export class SignInStore extends BaseFormStore<EmailSignInData> {
  callbackURL?: string;
  showPassword = false;

  constructor(public readonly rootStore: RootStore) {
    super(rootStore, { email: "", password: "", rememberMe: true });

    makeObservable(this, {
      showPassword: observable,
      callbackURL: observable,

      onSubmit: action,
      toggleShowPassword: action,
      setCallbackURL: action,
    });
  }

  setCallbackURL = (callbackURL?: string) => {
    this.callbackURL = callbackURL;
  };

  toggleShowPassword = () => {
    this.showPassword = !this.showPassword;
  };

  onSubmit = async (event?: FormEvent<HTMLFormElement>) => {
    event?.preventDefault();
    this.setIsLoading(true);

    try {
      const res = await signInWithEmailAction({ ...toJS(this.form), callbackURL: this.callbackURL });

      if (!res.ok) this.setError(res.error);
    } finally {
      this.setIsLoading(false);
    }
  };
}
