import type { FormEvent } from "react";
import type { RootStore } from "@/core/stores/root.store";
import type { EntityType } from "@/generated/prisma";
import type {
  EntityTerminologyOverride,
  TerminologySelectionMap,
} from "@/features/entity-terminology/entity-terminology.types";

import { action, makeObservable, toJS } from "mobx";
import { cloneDeep } from "lodash";
import { Currency, Resource } from "@/generated/prisma";

import { updateCompanyAction } from "../../actions";

import { BaseFormStore } from "@/core/base/base-form.store";
import {
  defaultTerminologySelections,
  isTerminologyPresetKey,
  terminologySelectionsFromOverrides,
  terminologySelectionsToEntries,
} from "@/features/entity-terminology/entity-terminology.constants";

type CompanySettingsFormData = {
  currency: Currency;
  terminology: TerminologySelectionMap;
};

export class CompanySettingsStore extends BaseFormStore<CompanySettingsFormData> {
  constructor(rootStore: RootStore) {
    super(rootStore, { currency: Currency.eur, terminology: defaultTerminologySelections() }, Resource.company);

    makeObservable(this, {
      onSubmit: action,
      initTerminology: action,
      setTerminologyPreset: action,
    });
  }

  initTerminology = (overrides: EntityTerminologyOverride[]) => {
    const terminology = terminologySelectionsFromOverrides(overrides);
    this.form = { ...this.form, terminology };
    this.savedState = { ...this.savedState, terminology: cloneDeep(terminology) };
  };

  setTerminologyPreset = (entityType: EntityType, presetKey: string) => {
    if (!isTerminologyPresetKey(entityType, presetKey)) return;

    this.form = { ...this.form, terminology: { ...this.form.terminology, [entityType]: presetKey } };
  };

  onSubmit = async (event?: FormEvent<HTMLFormElement>) => {
    event?.preventDefault();
    this.setIsLoading(true);

    try {
      const result = await updateCompanyAction({
        currency: this.form.currency,
        terminology: terminologySelectionsToEntries(this.form.terminology),
      });

      if (result.ok) {
        const company = this.rootStore.companyStore.company;
        if (company) this.rootStore.companyStore.setCompany({ ...company, currency: this.form.currency });

        await this.rootStore.terminologyStore.refresh();
        this.onInitOrRefresh({ currency: this.form.currency, terminology: toJS(this.form.terminology) });
      } else this.setError(result.error);
    } finally {
      this.setIsLoading(false);
    }
  };
}
