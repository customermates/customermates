import type { RootStore } from "@/core/stores/root.store";

import { action, makeObservable, observable } from "mobx";

import { signOutAction } from "@/app/[locale]/actions";
import { BaseStore } from "@/core/base/base.store";
import { toastZodErrorTree } from "@/core/utils/toast-zod-error-tree";

import { acceptLegalDocumentsAction } from "../actions";

export class LegalUpdateStore extends BaseStore {
  checked = false;

  constructor(rootStore: RootStore) {
    super(rootStore);
    makeObservable(this, {
      checked: observable,
      onInitOrRefresh: action,
      setChecked: action,
      accept: action,
      signOut: action,
    });
  }

  onInitOrRefresh = (): void => {
    this.checked = false;
  };

  setChecked = (checked: boolean): void => {
    this.checked = checked;
  };

  accept = async (): Promise<void> => {
    if (!this.checked) return;

    await this.rootStore.loadingOverlayStore.withLoading(async () => {
      const result = await acceptLegalDocumentsAction({
        agreeToLegalDocuments: true,
      });
      if (!result.ok) toastZodErrorTree(result.error);
    });
  };

  signOut = async (): Promise<void> => {
    await this.rootStore.loadingOverlayStore.withLoading(async () => {
      const result = await signOutAction();
      if (!result.ok) toastZodErrorTree(result.error);
    });
  };
}
