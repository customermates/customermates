import type { FormEvent } from "react";
import type { RootStore } from "@/core/stores/root.store";
import type { UpdateCompanyDetailsData } from "@/features/company/update-company-details.interactor";

import { action, makeObservable, toJS } from "mobx";
import { Currency, Resource } from "@/generated/prisma";

import { updateCompanyAction } from "../../actions";

import { BaseFormStore } from "@/core/base/base-form.store";

export class CompanySettingsStore extends BaseFormStore<UpdateCompanyDetailsData> {
  constructor(rootStore: RootStore) {
    super(rootStore, { currency: Currency.eur }, Resource.company);

    makeObservable(this, {
      onSubmit: action,
    });
  }

  onSubmit = async (event?: FormEvent<HTMLFormElement>) => {
    event?.preventDefault();
    this.setIsLoading(true);

    try {
      const res = await updateCompanyAction(toJS(this.form));

      if (res.ok) {
        this.onInitOrRefresh(res.data);
        const company = this.rootStore.companyStore.company;
        if (company) this.rootStore.companyStore.setCompany({ ...company, ...res.data });
      } else this.setError(res.error);
    } finally {
      this.setIsLoading(false);
    }
  };
}
