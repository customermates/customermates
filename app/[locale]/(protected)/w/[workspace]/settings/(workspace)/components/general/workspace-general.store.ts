import type { FormEvent } from "react";
import type { RootStore } from "@/core/stores/root.store";
import type { ManageAction } from "@/features/role/resource-access";

import { action, makeObservable } from "mobx";
import { Action, Resource } from "@/generated/prisma";

import { BaseFormStore } from "@/core/base/base-form.store";

import { renameWorkspaceAction, saveWorkspaceBrandAction, updateWorkspaceSlugAction } from "../../actions";

export const WORKSPACE_GENERAL_SETTINGS_PATH = "/settings/general";

type WorkspaceGeneralForm = { name: string; slug: string; accentColor: string };

export class WorkspaceGeneralStore extends BaseFormStore<WorkspaceGeneralForm> {
  constructor(rootStore: RootStore) {
    super(rootStore, { name: "", slug: "", accentColor: "" }, Resource.company);

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
    let navigating = false;

    try {
      const { name, slug } = this.form;
      const accentColor = this.form.accentColor.trim().toLowerCase();

      if (accentColor !== this.savedState.accentColor) {
        const branded = await saveWorkspaceBrandAction({ accentColor: accentColor === "" ? null : accentColor });
        if (!branded.ok) {
          this.setError(branded.error);
          return;
        }

        const { name: savedName, slug: savedSlug } = this.savedState;
        this.onInitOrRefresh({ accentColor: branded.data.accentColor ?? "", name: savedName, slug: savedSlug });
        this.onChange("name", name);
        this.onChange("slug", slug);
        this.setIsLoading(true);
      } else if (accentColor !== this.form.accentColor) this.onChange("accentColor", accentColor);

      const saved = this.savedState;

      if (name !== saved.name) {
        const renamed = await renameWorkspaceAction({ name });
        if (!renamed.ok) {
          this.setError(renamed.error);
          return;
        }

        this.rootStore.workspacesStore.renameCurrent(renamed.data.name);
        this.onInitOrRefresh({ name: renamed.data.name, slug: saved.slug });
        this.onChange("slug", slug);
        this.setIsLoading(true);
      }

      if (slug === saved.slug) return;

      const moved = await updateWorkspaceSlugAction({ slug });
      if (!moved.ok) {
        this.setError(moved.error);
        return;
      }

      this.onInitOrRefresh({ slug: moved.data.slug });
      this.setIsLoading(true);
      navigating = true;
      this.rootStore.workspacesStore.openWorkspace(moved.data.slug, WORKSPACE_GENERAL_SETTINGS_PATH);
    } finally {
      if (!navigating) this.setIsLoading(false);
    }
  };
}
