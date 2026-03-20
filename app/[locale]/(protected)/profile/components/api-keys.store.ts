import type { ApiKey } from "@/features/api-key/get-api-keys.interactor";
import type { RootStore } from "@/core/stores/root.store";
import type { XTableColumn } from "@/core/base/base-data-view.store";
import type { GetQueryParams } from "@/core/base/base-get.schema";

import { action, makeObservable } from "mobx";

import { Resource } from "@/generated/prisma";

import { deleteApiKeyAction, refreshApiKeysAction } from "../actions";

import { BaseDataViewStore } from "@/core/base/base-data-view.store";

export class ApiKeysStore extends BaseDataViewStore<ApiKey> {
  constructor(public readonly rootStore: RootStore) {
    super(rootStore, Resource.api);

    makeObservable(this, {
      delete: action,
    });
  }

  get columnsDefinition(): XTableColumn[] {
    return [];
  }

  delete = async (id: string): Promise<void> => {
    await this.rootStore.loadingOverlayStore.withLoading(async () => {
      const res = await deleteApiKeyAction({ id });
      if (res.ok) await this.removeItem(id);
    });
  };

  protected async refreshAction(_params?: GetQueryParams) {
    const apiKeys = await refreshApiKeysAction();

    return { items: apiKeys };
  }
}
