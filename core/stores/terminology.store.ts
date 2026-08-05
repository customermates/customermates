import type { RootStore } from "./root.store";
import type { EntityTerminologyOverride } from "@/features/entity-terminology/entity-terminology.types";

import { action, makeObservable, observable } from "mobx";

import { BaseStore } from "@/core/base/base.store";
import { getCompanySettingsAction } from "@/app/actions";

export class TerminologyStore extends BaseStore {
  overrides: EntityTerminologyOverride[] = [];

  constructor(rootStore: RootStore) {
    super(rootStore);
    makeObservable(this, {
      overrides: observable,
      setOverrides: action,
      refresh: action,
    });
  }

  setOverrides = (overrides: EntityTerminologyOverride[]) => {
    this.overrides = overrides;
  };

  refresh = async () => {
    const result = await getCompanySettingsAction();
    if (result.ok) this.setOverrides(result.data.terminology.presets);
  };
}
