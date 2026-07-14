import type { FormEvent } from "react";
import type { UpdateUserDetailsData } from "@/features/user/upsert/update-user-details.interactor";
import type { RootStore } from "@/core/stores/root.store";

import { action, makeObservable, toJS } from "mobx";
import { CountryCode, Locale, Theme } from "@/generated/prisma";

import { updateUserAction } from "../actions";

import { BaseFormStore } from "@/core/base/base-form.store";

export class ProfileSettingsStore extends BaseFormStore<UpdateUserDetailsData> {
  constructor(rootStore: RootStore) {
    super(rootStore, {
      firstName: "",
      lastName: "",
      country: CountryCode.de,
      avatarUrl: "",
      theme: Theme.system,
      displayLanguage: Locale.en,
      formattingLocale: Locale.en,
    });

    makeObservable(this, {
      onSubmit: action,
    });
  }

  onSubmit = async (event?: FormEvent<HTMLFormElement>) => {
    event?.preventDefault();
    this.setIsLoading(true);

    try {
      const res = await updateUserAction(toJS(this.form));

      if (res.ok) {
        this.rootStore.userStore.applyUserUpdate(res.data);
        this.onInitOrRefresh(res.data);
      } else this.setError(res.error);
    } finally {
      this.setIsLoading(false);
    }
  };
}
