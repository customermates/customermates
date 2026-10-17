import type { RootStore } from "@/core/stores/root.store";
import type { McpConsentWorkspace } from "@/features/auth/list-mcp-consent-workspaces.interactor";

import { action, computed, makeObservable, observable, runInAction } from "mobx";

import { decideMcpConsentAction } from "../actions";

import { BaseStore } from "@/core/base/base.store";
import { notifyIfWorkspaceChanged } from "@/core/errors/workspace-changed-notice";

function defaultWorkspace(workspaces: McpConsentWorkspace[]): McpConsentWorkspace | null {
  const current = workspaces.find((workspace) => workspace.isCurrent);
  if (current && current.unavailableReason === null) return current;

  return workspaces.find((workspace) => workspace.unavailableReason === null) ?? current ?? workspaces[0] ?? null;
}

export class McpConsentStore extends BaseStore {
  isSubmitting = false;
  workspaces: McpConsentWorkspace[] = [];
  selectedCompanyId: string | null = null;

  constructor(rootStore: RootStore) {
    super(rootStore);

    makeObservable(this, {
      isSubmitting: observable,
      workspaces: observable.ref,
      selectedCompanyId: observable,
      selectedWorkspace: computed,
      canApprove: computed,
      initialize: action,
      select: action,
      decide: action,
    });
  }

  get selectedWorkspace(): McpConsentWorkspace | null {
    return this.workspaces.find((workspace) => workspace.companyId === this.selectedCompanyId) ?? null;
  }

  get canApprove(): boolean {
    return this.selectedWorkspace?.unavailableReason === null;
  }

  initialize = (workspaces: McpConsentWorkspace[]) => {
    const kept = workspaces.find(
      (workspace) => workspace.companyId === this.selectedCompanyId && workspace.unavailableReason === null,
    );
    this.workspaces = workspaces;
    this.selectedCompanyId = kept?.companyId ?? defaultWorkspace(workspaces)?.companyId ?? null;
  };

  select = (companyId: string) => {
    const workspace = this.workspaces.find((candidate) => candidate.companyId === companyId);
    if (this.isSubmitting || !workspace || workspace.unavailableReason !== null) return;

    this.selectedCompanyId = companyId;
  };

  decide = async (consentCode: string, accept: boolean): Promise<string | null> => {
    const companyId = this.selectedCompanyId;
    runInAction(() => {
      this.isSubmitting = true;
    });

    const result = await decideMcpConsentAction({ consentCode, accept, ...(companyId ? { companyId } : {}) }).catch(
      () => null,
    );

    if (result?.ok && result.data?.redirectURI) return result.data.redirectURI;
    if (notifyIfWorkspaceChanged(result)) return null;

    this.toastError("McpConsentCard.error");
    runInAction(() => {
      this.isSubmitting = false;
    });

    return null;
  };
}
