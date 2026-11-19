import type { TableColumn } from "@/core/base/base-data-view.store";
import type { GetQueryParams } from "@/core/base/base-get.schema";
import type { RootStore } from "@/core/stores/root.store";
import type { ConnectedApp } from "@/features/connected-apps/connected-app.schema";

import { action, makeObservable } from "mobx";
import { Resource } from "@/generated/prisma";

import { disconnectConnectedAppAction, refreshConnectedAppsAction } from "../actions";

import { BaseDataViewStore } from "@/core/base/base-data-view.store";
import { actionData } from "@/core/utils/action-data";
import { toastZodErrorTree } from "@/core/utils/toast-zod-error-tree";

export class ConnectedAppsStore extends BaseDataViewStore<ConnectedApp> {
  constructor(rootStore: RootStore) {
    super(rootStore, Resource.api);

    makeObservable(this, { disconnect: action });
  }

  get columnsDefinition(): TableColumn[] {
    return [];
  }

  disconnect = (id: string): Promise<boolean> =>
    this.rootStore.loadingOverlayStore.withLoading(async () => {
      const result = await disconnectConnectedAppAction({ id });
      if (!result.ok) {
        toastZodErrorTree(result.error);
        return false;
      }

      await this.removeItem(id);
      return true;
    });

  protected async refreshAction(_params?: GetQueryParams) {
    const apps = await actionData(refreshConnectedAppsAction());

    return { items: apps };
  }
}
