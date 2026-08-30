import type { RootStore } from "@/core/stores/root.store";
import type { OperatorUserDetailDto } from "@/ee/operator/operator.schema";

import { makeObservable, action, observable, runInAction } from "mobx";

import { BaseModalStore } from "@/core/base/base-modal.store";

import { getOperatorUserDetailAction } from "./actions";

type OperatorUserModalState = { user: OperatorUserDetailDto | null };

export class OperatorUserModalStore extends BaseModalStore<OperatorUserModalState> {
  public loadFailed = false;

  constructor(rootStore: RootStore) {
    super(rootStore, { user: null });
    this.withUnsavedChangesGuard = false;

    makeObservable(this, {
      loadFailed: observable,
      openForUser: action,
      applyUser: action,
    });
  }

  applyUser = (user: OperatorUserDetailDto) => {
    this.onInitOrRefresh({ user });
  };

  openForUser = async (userId: string) => {
    runInAction(() => {
      this.loadFailed = false;
      this.setIsLoading(true);
    });
    this.open();

    const result = await getOperatorUserDetailAction(userId);

    runInAction(() => {
      this.setIsLoading(false);
      if (result.status === "success") this.onInitOrRefresh({ user: result.data });
      else this.loadFailed = true;
    });
  };
}
