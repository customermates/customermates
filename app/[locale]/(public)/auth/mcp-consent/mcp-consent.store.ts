import type { RootStore } from "@/core/stores/root.store";

import { action, makeObservable, observable, runInAction } from "mobx";

import { decideMcpConsentAction } from "../actions";

import { BaseStore } from "@/core/base/base.store";

export class McpConsentStore extends BaseStore {
  isSubmitting = false;

  constructor(rootStore: RootStore) {
    super(rootStore);

    makeObservable(this, {
      isSubmitting: observable,
      decide: action,
    });
  }

  decide = async (consentCode: string, accept: boolean): Promise<string | null> => {
    runInAction(() => {
      this.isSubmitting = true;
    });

    const result = await decideMcpConsentAction({ consentCode, accept }).catch(() => null);

    if (result?.redirectURI) return result.redirectURI;

    this.toastError("McpConsentCard.error");
    runInAction(() => {
      this.isSubmitting = false;
    });

    return null;
  };
}
