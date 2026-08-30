import type { RootStore } from "@/core/stores/root.store";
import type { OperatorUserDetailDto } from "@/ee/operator/operator.schema";
import type { OperatorWorkspaceRowDto } from "@/ee/operator/operator-lists.schema";

import { makeObservable, action, runInAction } from "mobx";

import { BaseModalStore } from "@/core/base/base-modal.store";

import { getOperatorUserDetailAction } from "../users/actions";

type OperatorWorkspaceModalState = {
  workspace: OperatorWorkspaceRowDto | null;
  owner: OperatorUserDetailDto | null;
};

export class OperatorWorkspaceModalStore extends BaseModalStore<OperatorWorkspaceModalState> {
  constructor(rootStore: RootStore) {
    super(rootStore, { workspace: null, owner: null });
    this.withUnsavedChangesGuard = false;

    makeObservable(this, {
      openForWorkspace: action,
      applyOwner: action,
    });
  }

  applyOwner = (owner: OperatorUserDetailDto) => {
    this.onInitOrRefresh({ owner });
  };

  openForWorkspace = (workspace: OperatorWorkspaceRowDto) => {
    this.onInitOrRefresh({ workspace, owner: null });
    this.open();
    if (!workspace.ownerUserId) return;

    this.setIsLoading(true);
    void getOperatorUserDetailAction(workspace.ownerUserId).then((result) => {
      runInAction(() => {
        this.setIsLoading(false);
        if (result.status === "success") this.onInitOrRefresh({ owner: result.data });
      });
    });
  };
}
