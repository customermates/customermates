import type { RootStore } from "@/core/stores/root.store";
import type { OperatorUserDetailDto } from "@/ee/operator/operator.schema";
import type { OperatorUserFormContext } from "./operator-user-forms.store";

import { makeObservable, action, observable, runInAction } from "mobx";

import { BaseModalStore } from "@/core/base/base-modal.store";

import { getOperatorUserDetailAction } from "./actions";
import {
  OperatorUserCreditAdjustmentFormStore,
  OperatorUserCreditResetFormStore,
  OperatorUserPlatformAccessFormStore,
  OperatorUserStatusFormStore,
} from "./operator-user-forms.store";

type OperatorUserModalState = { user: OperatorUserDetailDto | null };

export class OperatorUserModalStore extends BaseModalStore<OperatorUserModalState> {
  public loadFailed = false;
  public activeTab = "overview";

  public readonly statusForm: OperatorUserStatusFormStore;
  public readonly platformAccessForm: OperatorUserPlatformAccessFormStore;
  public readonly creditAdjustmentForm: OperatorUserCreditAdjustmentFormStore;
  public readonly creditResetForm: OperatorUserCreditResetFormStore;

  constructor(rootStore: RootStore) {
    super(rootStore, { user: null });
    this.withUnsavedChangesGuard = false;

    const context: OperatorUserFormContext = {
      getUser: () => this.form.user,
      applyUser: (user) => this.applyUser(user),
      refreshDetail: () => this.refreshDetail(),
    };

    this.statusForm = new OperatorUserStatusFormStore(rootStore, context);
    this.platformAccessForm = new OperatorUserPlatformAccessFormStore(rootStore, context);
    this.creditAdjustmentForm = new OperatorUserCreditAdjustmentFormStore(rootStore, context);
    this.creditResetForm = new OperatorUserCreditResetFormStore(rootStore, context);

    makeObservable(this, {
      activeTab: observable,
      loadFailed: observable,
      openForUser: action,
      applyUser: action,
      setActiveTab: action,
    });
  }

  setActiveTab = (activeTab: string) => {
    this.activeTab = activeTab;
  };

  applyUser = (user: OperatorUserDetailDto) => {
    this.onInitOrRefresh({ user });
    this.syncForms(user);
    this.rootStore.operatorUsersStore.setQueryOptions({ forceRefresh: true });
  };

  openForUser = async (userId: string) => {
    runInAction(() => {
      this.loadFailed = false;
      this.activeTab = "overview";
      this.setIsLoading(true);
    });
    this.open();

    const result = await getOperatorUserDetailAction(userId);

    runInAction(() => {
      this.setIsLoading(false);
      if (result.status === "success") {
        this.onInitOrRefresh({ user: result.data });
        this.syncForms(result.data);
      } else this.loadFailed = true;
    });
  };

  refreshDetail = async () => {
    const userId = this.form.user?.userId;
    if (!userId) return;

    const result = await getOperatorUserDetailAction(userId);
    if (result.status !== "success") return;

    runInAction(() => {
      this.onInitOrRefresh({ user: result.data });
      this.syncForms(result.data);
    });
  };

  private syncForms(user: OperatorUserDetailDto | null) {
    this.statusForm.syncFromUser(user);
    this.platformAccessForm.syncFromUser(user);
    this.creditAdjustmentForm.syncFromUser(user);
    this.creditResetForm.syncFromUser(user);
  }
}
