import type { FormEvent } from "react";
import type { RootStore } from "@/core/stores/root.store";
import type { CreateWorkspaceData } from "@/features/workspace/create-workspace.interactor";

import { action, makeObservable } from "mobx";

import { createWorkspaceAction } from "@/app/[locale]/(protected)/settings/(account)/workspaces/actions";
import { BaseModalStore } from "@/core/base/base-modal.store";

export class CreateWorkspaceModalStore extends BaseModalStore<CreateWorkspaceData> {
  constructor(rootStore: RootStore) {
    super(rootStore, { name: "", agreeToTerms: false }, undefined, { register: false });

    makeObservable(this, {
      start: action,
      onSubmit: action,
    });
  }

  start = (invoker?: HTMLElement | null, fallback?: HTMLElement | null) => {
    if (!this.rootStore.workspacesStore.canCreate) return;

    this.rootStore.navigationGuard.tryNavigate(() => {
      this.onInitOrRefresh({ name: "", agreeToTerms: false });
      if (invoker) this.openFrom(invoker, fallback);
      else this.open();
    });
  };

  protected override prepareToClose(): boolean {
    return !this.isLoading;
  }

  onSubmit = async (event?: FormEvent<HTMLFormElement>) => {
    event?.preventDefault();
    if (this.isLoading) return;

    this.setIsLoading(true);
    let created = false;
    try {
      const res = await createWorkspaceAction({ name: this.form.name, agreeToTerms: this.form.agreeToTerms });
      if (!res.ok) {
        this.setError(res.error);
        return;
      }

      created = true;
      this.rootStore.workspacesStore.enter({ companyId: res.data.companyId, name: this.form.name.trim() }, "/");
    } finally {
      if (!created) this.setIsLoading(false);
    }
  };
}
