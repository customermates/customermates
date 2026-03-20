import type { FormEvent } from "react";
import type { RootStore } from "@/core/stores/root.store";
import type { UpdateCompanyDetailsData } from "@/features/company/update-company-details.interactor";

import { action, makeObservable, observable, toJS } from "mobx";
import { CountryCode, Currency, Resource } from "@/generated/prisma";

import { updateCompanyAction } from "../../actions";

import { BaseFormStore } from "@/core/base/base-form.store";

export class CompanyDetailsCardStore extends BaseFormStore<UpdateCompanyDetailsData> {
  hasSubmittedSuccessfully = false;

  constructor(public readonly rootStore: RootStore) {
    super(
      rootStore,
      {
        name: "",
        street: "",
        city: "",
        country: CountryCode.de,
        postalCode: "",
        currency: Currency.eur,
      },
      Resource.company,
    );

    makeObservable(this, {
      hasSubmittedSuccessfully: observable,
      setHasSubmittedSuccessfully: action,
      onSubmit: action,
    });
  }

  setHasSubmittedSuccessfully = (value: boolean) => {
    this.hasSubmittedSuccessfully = value;
  };

  onSubmit = async (event?: FormEvent<HTMLFormElement>) => {
    event?.preventDefault();
    this.setIsLoading(true);

    try {
      const res = await updateCompanyAction(toJS(this.form));

      if (res.ok) {
        this.setHasSubmittedSuccessfully(true);
        this.onInitOrRefresh(res.data);
      } else this.setError(res.error);
    } finally {
      this.setIsLoading(false);
    }
  };
}
