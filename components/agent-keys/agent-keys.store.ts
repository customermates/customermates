import type { RootStore } from "@/core/stores/root.store";
import type { AgentProviderKeyDto } from "@/ee/agent-keys/agent-provider-key.schema";

import { action, computed, makeObservable, observable, runInAction } from "mobx";

import { Action, Resource } from "@/generated/prisma";

import { BaseStore } from "@/core/base/base.store";
import { actionData } from "@/core/utils/action-data";
import { toastZodErrorTree } from "@/core/utils/toast-zod-error-tree";

import {
  deleteAgentProviderKeyAction,
  refreshAgentProviderKeysAction,
  testAgentProviderKeyAction,
} from "./agent-key-actions";

export class AgentKeysStore extends BaseStore {
  items: AgentProviderKeyDto[] = [];
  busyId: string | null = null;

  constructor(rootStore: RootStore) {
    super(rootStore);

    makeObservable(this, {
      items: observable.ref,
      busyId: observable,
      canManage: computed,
      setItems: action,
    });
  }

  get canManage(): boolean {
    void this.rootStore.userStore.user;
    return this.rootStore.userStore.can(Resource.company, Action.update);
  }

  setItems = (items: AgentProviderKeyDto[]) => {
    this.items = items;
  };

  refresh = async () => {
    const { keys } = await actionData(refreshAgentProviderKeysAction());
    runInAction(() => this.setItems(keys));
  };

  test = async (id: string): Promise<boolean> => {
    runInAction(() => {
      this.busyId = id;
    });
    try {
      const result = await testAgentProviderKeyAction({ id });
      if (!result.ok) {
        toastZodErrorTree(result.error);
        return false;
      }
      runInAction(() => this.setItems(this.items.map((key) => (key.id === id ? result.data : key))));
      this.toastSuccess("AgentKeys.testSucceeded");
      return true;
    } finally {
      runInAction(() => {
        this.busyId = null;
      });
    }
  };

  remove = async (id: string): Promise<boolean> => {
    return this.rootStore.loadingOverlayStore.withLoading(async () => {
      const result = await deleteAgentProviderKeyAction({ id });
      if (!result.ok) {
        toastZodErrorTree(result.error);
        return false;
      }
      runInAction(() => this.setItems(this.items.filter((key) => key.id !== id)));
      return true;
    });
  };
}
