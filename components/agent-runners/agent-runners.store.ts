import type { TableColumn } from "@/core/base/base-data-view.store";
import type { GetQueryParams } from "@/core/base/base-get.schema";
import type { RootStore } from "@/core/stores/root.store";
import type { ListedAgentRunner } from "@/features/agent-runners/get-agent-runners.interactor";

import { action, computed, makeObservable } from "mobx";
import { Action, Resource } from "@/generated/prisma";

import { BaseDataViewStore } from "@/core/base/base-data-view.store";
import { actionData } from "@/core/utils/action-data";
import { toastZodErrorTree } from "@/core/utils/toast-zod-error-tree";

import { refreshAgentRunnersAction, revokeAgentRunnerAction } from "./actions";

export class AgentRunnersStore extends BaseDataViewStore<ListedAgentRunner> {
  constructor(rootStore: RootStore) {
    super(rootStore, Resource.api);

    makeObservable(this, { revoke: action, canRevoke: computed, hasLiveRunner: computed });
  }

  get canRevoke(): boolean {
    return this.rootStore.userStore.can(Resource.api, Action.delete);
  }

  get hasLiveRunner(): boolean {
    return this.items.some((runner) => runner.revokedAt === null);
  }

  get columnsDefinition(): TableColumn[] {
    return [];
  }

  revoke = (id: string): Promise<boolean> =>
    this.rootStore.loadingOverlayStore.withLoading(async () => {
      const result = await revokeAgentRunnerAction({ id });
      if (!result.ok) {
        toastZodErrorTree(result.error);
        return false;
      }

      await this.refresh();
      return true;
    });

  protected async refreshAction(_params?: GetQueryParams) {
    const { runners } = await actionData(refreshAgentRunnersAction());

    return { items: runners };
  }
}
