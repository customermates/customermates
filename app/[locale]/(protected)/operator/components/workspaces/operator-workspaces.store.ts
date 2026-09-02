import type { RootStore } from "@/core/stores/root.store";
import type { TableColumn } from "@/core/base/base-data-view.store";
import type { GetQueryParams } from "@/core/base/base-get.schema";
import type {
  CorrectOperatorSubscriptionSnapshotData,
  UpdateHostedAiEnterpriseAllowanceData,
} from "@/ee/operator/operator.schema";
import type { OperatorWorkspaceRowDto } from "@/ee/operator/operator-lists.schema";

import { action, makeObservable } from "mobx";

import { getOperatorWorkspacesAction } from "../../actions";
import { correctOperatorSubscriptionSnapshotAction } from "../../users/actions";
import { updateOperatorEnterpriseAllowanceAction } from "../../workspaces/actions";

import { BaseDataViewStore } from "@/core/base/base-data-view.store";
import { toastZodErrorTree } from "@/core/utils/toast-zod-error-tree";

export class OperatorWorkspacesStore extends BaseDataViewStore<OperatorWorkspaceRowDto> {
  constructor(rootStore: RootStore) {
    super(rootStore);

    makeObservable(this, {
      correctSubscription: action,
      updateEnterpriseAllowance: action,
    });
  }

  get columnsDefinition(): TableColumn[] {
    return [
      { uid: "workspace" },
      { uid: "owner" },
      { uid: "plan" },
      { uid: "subscription" },
      { uid: "members" },
      { uid: "allowance" },
      { uid: "adProvider" },
      { uid: "createdAt", sortable: true },
    ];
  }

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

  updateEnterpriseAllowance = async (data: UpdateHostedAiEnterpriseAllowanceData): Promise<boolean> => {
    return this.rootStore.loadingOverlayStore.withLoading(async () => {
      const res = await updateOperatorEnterpriseAllowanceAction(data);
      if (!res.ok) {
        toastZodErrorTree(res.error);
        return false;
      }

      await this.refresh();
      return true;
    });
  };

  protected async refreshAction(params?: GetQueryParams) {
    return getOperatorWorkspacesAction(params);
  }
}
