import type { RootStore } from "@/core/stores/root.store";

import { action, makeObservable, observable } from "mobx";

import { BaseFormStore } from "@/core/base/base-form.store";

type WikiHomepageSetupForm = { homepage: string };

export class WikiHomepageSetupStore extends BaseFormStore<WikiHomepageSetupForm> {
  clientRequestId = crypto.randomUUID();

  constructor(rootStore: RootStore, homepage: string) {
    super(rootStore, { homepage });
    this.setWithUnsavedChangesGuard(false);

    makeObservable(this, {
      clientRequestId: observable,
      renewClientRequestId: action,
    });
  }

  renewClientRequestId = () => {
    this.clientRequestId = crypto.randomUUID();
  };

  protected override afterChange() {
    this.renewClientRequestId();
  }
}
