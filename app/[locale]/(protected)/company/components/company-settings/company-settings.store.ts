import type { FormEvent } from "react";
import type { RootStore } from "@/core/stores/root.store";

import { action, makeObservable } from "mobx";
import { Action, Currency, Resource } from "@/generated/prisma";

import { BaseFormStore } from "@/core/base/base-form.store";
import { updateCompanyAction } from "../../actions";

type CompanySettingsFormData = { currency: Currency };

export class CompanySettingsStore extends BaseFormStore<CompanySettingsFormData> {
  constructor(rootStore: RootStore) {
    super(rootStore, { currency: Currency.eur }, Resource.company);
    makeObservable(this, { onSubmit: action });
  }

  protected override get manageAction() {
    return Action.update;
  }

  onSubmit = async (event?: FormEvent<HTMLFormElement>) => {
    event?.preventDefault();
    this.setIsLoading(true);

    try {
      const result = await updateCompanyAction({ currency: this.form.currency });
      if (result.ok) {
        const company = this.rootStore.companyStore.company;
        if (company) this.rootStore.companyStore.setCompany({ ...company, currency: this.form.currency });
        this.onInitOrRefresh({ currency: this.form.currency });
      } else this.setError(result.error);
    } finally {
      this.setIsLoading(false);
    }
  };
}
