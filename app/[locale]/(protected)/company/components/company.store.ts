import type { RootStore } from "@/core/stores/root.store";

import { action, makeObservable, observable } from "mobx";

import type { Company } from "@/generated/prisma";

import { getCompanyDetailsAction } from "../actions";

export class CompanyStore {
  company: Company | null = null;

  constructor(public readonly rootStore: RootStore) {
    makeObservable(this, {
      company: observable,
      setCompany: action,
      refresh: action,
    });
  }

  setCompany = (company: Company) => {
    this.company = company;
  };

  refresh = async () => {
    const company = await getCompanyDetailsAction();

    this.setCompany(company);
  };
}
