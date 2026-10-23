import type { RootStore } from "@/core/stores/root.store";
import type { WorkspaceSummary } from "@/features/workspace/workspace.schema";

import { action, computed, makeObservable, observable } from "mobx";

import {
  deleteWorkspaceAction,
  leaveWorkspaceAction,
  listMyWorkspacesAction,
  withdrawWorkspaceRequestAction,
} from "@/app/[locale]/(protected)/w/[workspace]/settings/(account)/workspaces/actions";
import { BaseStore } from "@/core/base/base.store";
import { WORKSPACE_LANDING_PATH, workspaceLocalePath } from "@/core/navigation/workspace-paths";
import { toastZodErrorTree } from "@/core/utils/toast-zod-error-tree";
import { CustomErrorCode } from "@/core/validation/validation.types";
import { buildLocalePath } from "@/i18n/locale-registry";

export type WorkspaceEntry = "/dashboard" | "/auth/pending" | "/onboarding/wizard";

export class WorkspacesStore extends BaseStore {
  items: WorkspaceSummary[] = [];
  unavailable = false;
  isNavigating = false;

  constructor(rootStore: RootStore) {
    super(rootStore);

    makeObservable(this, {
      items: observable.ref,
      unavailable: observable,
      isNavigating: observable,
      current: computed,
      others: computed,
      canCreate: computed,
      setWorkspaces: action,
      renameCurrent: action,
      showUnavailable: action,
      setIsNavigating: action,
    });
  }

  get current(): WorkspaceSummary | null {
    return this.items.find((workspace) => workspace.isCurrent) ?? null;
  }

  get others(): WorkspaceSummary[] {
    return this.items.filter((workspace) => !workspace.isCurrent);
  }

  get canCreate(): boolean {
    return this.rootStore.appMode !== "demo";
  }

  setWorkspaces = (items: WorkspaceSummary[]) => {
    this.items = items;
  };

  renameCurrent = (name: string) => {
    this.items = this.items.map((workspace) => (workspace.isCurrent ? { ...workspace, name } : workspace));
  };

  showUnavailable = () => {
    if (this.isNavigating) return;
    this.unavailable = true;
  };

  setIsNavigating = (isNavigating: boolean) => {
    this.isNavigating = isNavigating;
  };

  refresh = async (): Promise<void> => {
    const result = await listMyWorkspacesAction();
    if (!result.ok) {
      toastZodErrorTree(result.error);
      return;
    }

    this.setWorkspaces(result.data);
  };

  requestSwitch = (companyId: string) => {
    if (this.isNavigating || companyId === this.current?.companyId) return;
    const target = this.items.find((workspace) => workspace.companyId === companyId);
    if (!target) return;

    this.rootStore.navigationGuard.tryNavigate(() => this.openWorkspace(target.slug));
  };

  openWorkspace = (slug: string, path: string = WORKSPACE_LANDING_PATH) => {
    this.navigateTo(workspaceLocalePath(this.rootStore.localeStore.locale, slug, path));
  };

  enter = (entry: WorkspaceEntry) => {
    this.navigateTo(buildLocalePath(this.rootStore.localeStore.locale, entry));
  };

  leaveUnavailable = () => {
    this.enter("/dashboard");
  };

  leaveCurrent = async (): Promise<boolean> => {
    const current = this.current;
    if (this.isNavigating || !current) return false;

    const result = await this.whileLoading(() => leaveWorkspaceAction({ companyId: current.companyId }));
    if (!result.ok) {
      if (result.code === CustomErrorCode.workspaceChanged) this.showUnavailable();
      else toastZodErrorTree(result.error);
      return false;
    }

    this.enter("/dashboard");
    return true;
  };

  deleteCurrent = async (): Promise<boolean> => {
    const current = this.current;
    if (this.isNavigating || !current) return false;

    const result = await this.whileLoading(() => deleteWorkspaceAction({ companyId: current.companyId }));
    if (!result.ok) {
      if (result.code === CustomErrorCode.workspaceChanged) this.showUnavailable();
      else toastZodErrorTree(result.error);
      return false;
    }

    this.enter("/dashboard");
    return true;
  };

  withdrawCurrentRequest = async (): Promise<boolean> => {
    const current = this.current;
    if (this.isNavigating || !current) return false;

    const result = await this.whileLoading(() => withdrawWorkspaceRequestAction({ companyId: current.companyId }));
    if (!result.ok) {
      toastZodErrorTree(result.error);
      return false;
    }

    this.enter("/dashboard");
    return true;
  };

  private navigateTo(href: string) {
    this.setIsNavigating(true);
    this.rootStore.loadingOverlayStore.setIsLoading(true);
    this.rootStore.navigationGuard.navigateDocument(href);
  }

  private async whileLoading<T extends { ok: boolean }>(run: () => Promise<T>): Promise<T> {
    const { loadingOverlayStore } = this.rootStore;
    loadingOverlayStore.setIsLoading(true);
    let succeeded = false;
    try {
      const result = await run();
      succeeded = result.ok;
      return result;
    } finally {
      if (!succeeded) loadingOverlayStore.setIsLoading(false);
    }
  }
}
