import type { RootStore } from "@/core/stores/root.store";
import type { McpConsentWorkspace } from "@/features/auth/list-mcp-consent-workspaces.interactor";

import { action, computed, makeObservable, observable, runInAction } from "mobx";

import { decideMcpConsentAction } from "../actions";

import { BaseStore } from "@/core/base/base.store";
import { notifyIfWorkspaceChanged } from "@/core/errors/workspace-changed-notice";

type ConsentOptions = { fixedWorkspace: boolean; termsRequired: boolean };

export class McpConsentStore extends BaseStore {
  isSubmitting = false;
  workspaces: McpConsentWorkspace[] = [];
  fixedWorkspace = false;
  termsRequired = false;
  termsAccepted = false;

  constructor(rootStore: RootStore) {
    super(rootStore);

    makeObservable(this, {
      isSubmitting: observable,
      workspaces: observable.ref,
      fixedWorkspace: observable,
      termsRequired: observable,
      termsAccepted: observable,
      usableWorkspaces: computed,
      canApprove: computed,
      canSubmitApproval: computed,
      initialize: action,
      setTermsAccepted: action,
      decide: action,
    });
  }

  get usableWorkspaces(): McpConsentWorkspace[] {
    return this.workspaces.filter((workspace) => workspace.unavailableReason === null);
  }

  get canApprove(): boolean {
    if (this.fixedWorkspace) return this.workspaces[0]?.unavailableReason === null;
    return this.usableWorkspaces.length > 0 || this.workspaces.length === 0;
  }

  get canSubmitApproval(): boolean {
    return this.canApprove && !this.isSubmitting && (!this.termsRequired || this.termsAccepted);
  }

  initialize = (workspaces: McpConsentWorkspace[], options: ConsentOptions) => {
    this.workspaces = workspaces;
    this.fixedWorkspace = options.fixedWorkspace;
    this.termsRequired = !options.fixedWorkspace && options.termsRequired;
    if (!this.termsRequired) this.termsAccepted = false;
  };

  setTermsAccepted = (accepted: boolean) => {
    if (this.isSubmitting) return;
    this.termsAccepted = accepted;
  };

  decide = async (consentCode: string, accept: boolean): Promise<string | null> => {
    const acceptTerms = accept && this.termsRequired ? this.termsAccepted : undefined;
    runInAction(() => {
      this.isSubmitting = true;
    });

    const result = await decideMcpConsentAction({
      consentCode,
      accept,
      ...(acceptTerms === undefined ? {} : { acceptTerms }),
    }).catch(() => null);

    if (result?.ok && result.data?.redirectURI) return result.data.redirectURI;
    if (notifyIfWorkspaceChanged(result)) return null;

    this.toastError("McpConsentCard.error");
    runInAction(() => {
      this.isSubmitting = false;
    });

    return null;
  };
}
