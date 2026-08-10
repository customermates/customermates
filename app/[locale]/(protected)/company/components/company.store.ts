import type { RootStore } from "@/core/stores/root.store";
import { BaseStore } from "@/core/base/base.store";

import { action, makeObservable, observable } from "mobx";

import type { Company } from "@/generated/prisma";

import { getCompanyDetailsAction } from "../actions";

export class CompanyStore extends BaseStore {
  company: Company | null = null;

  constructor(rootStore: RootStore) {
    super(rootStore);
    makeObservable(this, {
      company: observable,
      setCompany: action,
      refresh: action,
    });
  }

  setCompany = (company: Company | null) => {
    this.company = company;
  };

  refresh = async () => {
    const company = await getCompanyDetailsAction();

    this.setCompany(company);
  };
}
