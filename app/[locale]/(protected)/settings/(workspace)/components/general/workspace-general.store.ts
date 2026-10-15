import type { FormEvent } from "react";
import type { RootStore } from "@/core/stores/root.store";
import type { ManageAction } from "@/features/role/resource-access";
import type { RenameWorkspaceData } from "@/features/workspace/rename-workspace.interactor";

import { action, makeObservable, toJS } from "mobx";
import { Action, Resource } from "@/generated/prisma";

import { renameWorkspaceAction } from "@/app/[locale]/(protected)/settings/(account)/workspaces/actions";
import { BaseFormStore } from "@/core/base/base-form.store";

export class WorkspaceGeneralStore extends BaseFormStore<RenameWorkspaceData> {
  constructor(rootStore: RootStore) {
    super(rootStore, { name: "" }, Resource.company);

    makeObservable(this, {
      onSubmit: action,
    });
  }

  protected override get manageAction(): ManageAction {
    return Action.update;
  }

  onSubmit = async (event?: FormEvent<HTMLFormElement>) => {
    event?.preventDefault();
    this.setIsLoading(true);

    try {
      const res = await renameWorkspaceAction(toJS(this.form));

      if (res.ok) {
        this.rootStore.workspacesStore.renameCurrent(res.data.name);
        this.onInitOrRefresh(res.data);
      } else this.setError(res.error);
    } finally {
      this.setIsLoading(false);
    }
  };
}
