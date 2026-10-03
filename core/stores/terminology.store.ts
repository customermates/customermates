import type { RootStore } from "./root.store";
import type { EntityTerminologyOverride } from "@/features/entity-terminology/entity-terminology.types";

import { action, makeObservable, observable } from "mobx";

import { BaseStore } from "@/core/base/base.store";

export class TerminologyStore extends BaseStore {
  overrides: EntityTerminologyOverride[] = [];

  constructor(rootStore: RootStore) {
    super(rootStore);
    makeObservable(this, {
      overrides: observable,
      setOverrides: action,
    });
  }

  setOverrides = (overrides: EntityTerminologyOverride[]) => {
    this.overrides = overrides;
  };
}
