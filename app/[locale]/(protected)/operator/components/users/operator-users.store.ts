import type { RootStore } from "@/core/stores/root.store";
import type { TableColumn } from "@/core/base/base-data-view.store";
import type { GetQueryParams } from "@/core/base/base-get.schema";
import type {
  CorrectOperatorSubscriptionSnapshotData,
  CreateAgentCreditAdjustmentData,
  ResetOperatorUserCreditsData,
  UpdateOperatorUserPlatformAccessData,
  UpdateOperatorUserStatusData,
} from "@/ee/operator/operator.schema";
import type { OperatorUserRowDto } from "@/ee/operator/operator-lists.schema";

import { action, makeObservable } from "mobx";

import { getOperatorUsersAction } from "../../actions";
import {
  correctOperatorSubscriptionSnapshotAction,
  createOperatorUserCreditAdjustmentAction,
  resetOperatorUserCreditsAction,
  updateOperatorUserPlatformAccessAction,
  updateOperatorUserStatusAction,
} from "../../users/actions";

import { BaseDataViewStore } from "@/core/base/base-data-view.store";
import { toastZodErrorTree } from "@/core/utils/toast-zod-error-tree";

export class OperatorUsersStore extends BaseDataViewStore<OperatorUserRowDto> {
  constructor(rootStore: RootStore) {
    super(rootStore);

    makeObservable(this, {
      updateStatus: action,
      updatePlatformAccess: action,
      correctSubscription: action,
      applyCreditCorrection: action,
      resetCredits: action,
    });
  }

  get columnsDefinition(): TableColumn[] {
    return [
      { uid: "name" },
      { uid: "email", sortable: true },
      { uid: "workspace" },
      { uid: "status", sortable: true },
      { uid: "plan" },
      { uid: "subscription" },
      { uid: "operator" },
      { uid: "lastActiveAt", sortable: true },
      { uid: "createdAt", sortable: true },
      { uid: "credits" },
    ];
  }

  updateStatus = async (data: UpdateOperatorUserStatusData): Promise<boolean> => {
    return this.rootStore.loadingOverlayStore.withLoading(async () => {
      const res = await updateOperatorUserStatusAction(data);
      if (!res.ok) {
        toastZodErrorTree(res.error);
        return false;
      }

      await this.refresh();
      return true;
    });
  };

  updatePlatformAccess = async (data: UpdateOperatorUserPlatformAccessData): Promise<boolean> => {
    return this.rootStore.loadingOverlayStore.withLoading(async () => {
      const res = await updateOperatorUserPlatformAccessAction(data);
      if (!res.ok) {
        toastZodErrorTree(res.error);
        return false;
      }

      await this.refresh();
      return true;
    });
  };

  correctSubscription = async (data: CorrectOperatorSubscriptionSnapshotData): Promise<boolean> => {
    return this.rootStore.loadingOverlayStore.withLoading(async () => {
      const res = await correctOperatorSubscriptionSnapshotAction(data);
      if (!res.ok) {
        toastZodErrorTree(res.error);
        return false;
      }

      await this.refresh();
      return true;
    });
  };

  applyCreditCorrection = async (data: CreateAgentCreditAdjustmentData): Promise<boolean> => {
    return this.rootStore.loadingOverlayStore.withLoading(async () => {
      const res = await createOperatorUserCreditAdjustmentAction(data);
      if (!res.ok) {
        toastZodErrorTree(res.error);
        return false;
      }

      await this.refresh();
      return true;
    });
  };

  resetCredits = async (data: ResetOperatorUserCreditsData): Promise<boolean> => {
    return this.rootStore.loadingOverlayStore.withLoading(async () => {
      const res = await resetOperatorUserCreditsAction(data);
      if (!res.ok) {
        toastZodErrorTree(res.error);
        return false;
      }

      await this.refresh();
      return true;
    });
  };

  protected async refreshAction(params?: GetQueryParams) {
    return getOperatorUsersAction(params);
  }
}
