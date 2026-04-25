import type { FormEvent } from "react";
import type { UpdateUserSettingsData } from "@/features/user/upsert/update-user-settings.interactor";
import type { RootStore } from "@/core/stores/root.store";

import { action, makeObservable, toJS } from "mobx";
import { Locale, Theme } from "@/generated/prisma";

import { updateSettingsAction } from "../actions";

import { BaseFormStore } from "@/core/base/base-form.store";

export class UserSettingsStore extends BaseFormStore<UpdateUserSettingsData> {
  constructor(public readonly rootStore: RootStore) {
    super(rootStore, {
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
      const res = await updateSettingsAction(toJS(this.form));

      if (res.ok) {
        this.rootStore.userStore.updateUserSettings(res.data);
        this.onInitOrRefresh(res.data);
      } else this.setError(res.error);
    } finally {
      this.setIsLoading(false);
    }
  };
}
