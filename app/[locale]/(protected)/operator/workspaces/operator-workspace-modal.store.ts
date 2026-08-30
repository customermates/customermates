import type { RootStore } from "@/core/stores/root.store";
import type { OperatorUserDetailDto } from "@/ee/operator/operator.schema";
import type { OperatorWorkspaceRowDto } from "@/ee/operator/operator-lists.schema";
import type { OperatorWorkspaceFormContext } from "./operator-workspace-forms.store";

import { makeObservable, action, observable, runInAction } from "mobx";

import { BaseModalStore } from "@/core/base/base-modal.store";

import { getOperatorUserDetailAction } from "../users/actions";
import {
  OperatorWorkspaceAllowanceFormStore,
  OperatorWorkspaceSubscriptionFormStore,
} from "./operator-workspace-forms.store";

type OperatorWorkspaceModalState = {
  workspace: OperatorWorkspaceRowDto | null;
  owner: OperatorUserDetailDto | null;
};

export class OperatorWorkspaceModalStore extends BaseModalStore<OperatorWorkspaceModalState> {
  public activeTab = "overview";

  public readonly subscriptionForm: OperatorWorkspaceSubscriptionFormStore;
  public readonly allowanceForm: OperatorWorkspaceAllowanceFormStore;

  constructor(rootStore: RootStore) {
    super(rootStore, { workspace: null, owner: null });
    this.withUnsavedChangesGuard = false;

    const context: OperatorWorkspaceFormContext = {
      getWorkspace: () => this.form.workspace,
      getOwner: () => this.form.owner,
      applyOwner: (owner) => this.applyOwner(owner),
      refreshWorkspaces: () => this.rootStore.operatorWorkspacesStore.setQueryOptions({ forceRefresh: true }),
      refreshOwner: () => this.refreshOwner(),
    };

    this.subscriptionForm = new OperatorWorkspaceSubscriptionFormStore(rootStore, context);
    this.allowanceForm = new OperatorWorkspaceAllowanceFormStore(rootStore, context);

    makeObservable(this, {
      activeTab: observable,
      openForWorkspace: action,
      applyOwner: action,
      setActiveTab: action,
    });
  }

  setActiveTab = (activeTab: string) => {
    this.activeTab = activeTab;
  };

  applyOwner = (owner: OperatorUserDetailDto) => {
    this.onInitOrRefresh({ owner });
    this.subscriptionForm.syncFromOwner(owner);
  };

  openForWorkspace = (workspace: OperatorWorkspaceRowDto) => {
    this.activeTab = "overview";
    this.onInitOrRefresh({ workspace, owner: null });
    this.subscriptionForm.syncFromOwner(null);
    this.allowanceForm.syncFromWorkspace(workspace);
    this.open();
    if (!workspace.ownerUserId) return;

    this.setIsLoading(true);
    void getOperatorUserDetailAction(workspace.ownerUserId).then((result) => {
      runInAction(() => {
        this.setIsLoading(false);
        if (result.status === "success") this.applyOwner(result.data);
      });
    });
  };

  refreshOwner = async () => {
    const ownerUserId = this.form.owner?.userId ?? this.form.workspace?.ownerUserId;
    if (!ownerUserId) return;

    const result = await getOperatorUserDetailAction(ownerUserId);
    if (result.status !== "success") return;

    runInAction(() => this.applyOwner(result.data));
  };
}
