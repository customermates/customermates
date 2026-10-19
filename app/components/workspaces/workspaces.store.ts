import type { RootStore } from "@/core/stores/root.store";
import type { WorkspaceSummary } from "@/features/workspace/workspace.schema";
import type { WorkspaceTabState } from "@/features/workspace/get-workspace-tab-state.interactor";
import type { WorkspaceTabNotice } from "./workspace-tab-channel";

import { action, computed, makeObservable, observable } from "mobx";

import {
  deleteWorkspaceAction,
  getWorkspaceTabStateAction,
  leaveWorkspaceAction,
  listMyWorkspacesAction,
  switchWorkspaceAction,
  withdrawWorkspaceRequestAction,
} from "@/app/[locale]/(protected)/settings/(account)/workspaces/actions";
import { BaseStore } from "@/core/base/base.store";
import { notifyWorkspaceChanged, runUserAction } from "@/core/errors/report-application-error";
import { notifyIfWorkspaceChanged } from "@/core/errors/workspace-changed-notice";
import { toastZodErrorTree } from "@/core/utils/toast-zod-error-tree";
import { CustomErrorCode } from "@/core/validation/validation.types";
import { buildLocalePath } from "@/i18n/locale-registry";

import { WorkspaceTabChannel } from "./workspace-tab-channel";

type WorkspaceEntry = "/" | "/dashboard" | "/auth/pending" | "/onboarding/wizard";

export type ForeignWorkspaceNotice = { companyId: string | null; name: string | null; deleted?: true };

export class WorkspacesStore extends BaseStore {
  items: WorkspaceSummary[] = [];
  foreignNotice: ForeignWorkspaceNotice | null = null;
  isNavigating = false;
  private readonly tabChannel = new WorkspaceTabChannel();
  private deletionChecked = false;

  constructor(rootStore: RootStore) {
    super(rootStore);

    makeObservable(this, {
      items: observable.ref,
      foreignNotice: observable.ref,
      isNavigating: observable,
      current: computed,
      others: computed,
      canCreate: computed,
      setWorkspaces: action,
      renameCurrent: action,
      setForeignNotice: action,
      showWorkspaceChanged: action,
      showWorkspaceDeleted: action,
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
    const shown = this.current;
    const active = items.find((workspace) => workspace.isCurrent);
    if (shown && active && active.companyId !== shown.companyId) {
      if (!this.isNavigating) this.foreignNotice = { companyId: active.companyId, name: active.name };
      return;
    }

    this.items = items;
  };

  renameCurrent = (name: string) => {
    this.items = this.items.map((workspace) => (workspace.isCurrent ? { ...workspace, name } : workspace));
  };

  setForeignNotice = (notice: ForeignWorkspaceNotice | null) => {
    if (notice && this.foreignNotice?.deleted) return;
    this.foreignNotice = notice;
  };

  showWorkspaceChanged = () => {
    if (this.isNavigating || this.foreignNotice?.deleted) return;
    this.foreignNotice = { companyId: null, name: null };
    this.explainIfDeleted();
  };

  showWorkspaceDeleted = () => {
    if (this.isNavigating) return;
    this.foreignNotice = { companyId: null, name: null, deleted: true };
    notifyWorkspaceChanged();
  };

  verifyCurrent = async (): Promise<boolean> => {
    const current = this.current;
    if (!current || this.isNavigating) return true;
    if (this.foreignNotice) return false;

    const checked = this.deletionChecked;
    this.deletionChecked = true;
    const state = await this.tabState(current.companyId);
    if (state === "current") {
      this.deletionChecked = checked;
      return true;
    }

    if (state === "deleted") this.showWorkspaceDeleted();
    else notifyWorkspaceChanged();
    return false;
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

  connectTabs = (): (() => void) =>
    this.tabChannel.open((notice) => {
      const current = this.current;
      if (!current || this.isNavigating || notice.companyId === current.companyId) return;
      if (notice.deletedCompanyId === current.companyId) {
        this.showWorkspaceDeleted();
        return;
      }

      this.setForeignNotice({ companyId: notice.companyId, name: notice.name });
      this.explainIfDeleted();
    });

  announceCurrent = () => {
    const current = this.current;
    if (current) this.tabChannel.post({ companyId: current.companyId, name: current.name });
  };

  requestSwitch = (companyId: string) => {
    if (this.isNavigating || companyId === this.current?.companyId) return;
    this.rootStore.navigationGuard.tryNavigate(() => runUserAction(() => this.switchTo(companyId)));
  };

  switchTo = async (companyId: string): Promise<void> => {
    if (this.isNavigating) return;

    const name = this.items.find((workspace) => workspace.companyId === companyId)?.name ?? null;
    const result = await this.whileLoading(() => switchWorkspaceAction({ companyId }));
    if (!result.ok) {
      toastZodErrorTree(result.error);
      return;
    }

    this.enter({ companyId: result.data.companyId, name }, "/dashboard");
  };

  leaveCurrent = async (): Promise<boolean> => {
    const current = this.current;
    if (this.isNavigating || !current) return false;

    const result = await this.whileLoading(() => leaveWorkspaceAction({ companyId: current.companyId }));
    if (!result.ok) {
      if (result.code === CustomErrorCode.workspaceChanged) this.showWorkspaceChanged();
      else toastZodErrorTree(result.error);
      return false;
    }

    this.enter({ companyId: null, name: null }, "/");
    return true;
  };

  deleteCurrent = async (): Promise<boolean> => {
    const current = this.current;
    if (this.isNavigating || !current) return false;

    const result = await this.whileLoading(() => deleteWorkspaceAction({ companyId: current.companyId }));
    if (!result.ok) {
      if (result.code === CustomErrorCode.workspaceChanged) this.showWorkspaceChanged();
      else toastZodErrorTree(result.error);
      return false;
    }

    this.enter({ companyId: null, name: null, deletedCompanyId: current.companyId }, "/");
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

    this.enter({ companyId: null, name: null }, "/");
    return true;
  };

  enter = (notice: WorkspaceTabNotice, entry: WorkspaceEntry) => {
    this.tabChannel.post(notice);
    this.navigateTo(entry);
  };

  followOtherTab = () => {
    this.navigateTo("/dashboard");
  };

  private navigateTo(entry: WorkspaceEntry) {
    this.setIsNavigating(true);
    this.rootStore.loadingOverlayStore.setIsLoading(true);
    this.rootStore.navigationGuard.navigateDocument(buildLocalePath(this.rootStore.localeStore.locale, entry));
  }

  private explainIfDeleted() {
    const current = this.current;
    if (!current || this.deletionChecked) return;
    this.deletionChecked = true;

    void this.tabState(current.companyId)
      .then((state) => {
        if (state === "deleted") this.showWorkspaceDeleted();
      })
      .catch(() => undefined);
  }

  private async tabState(companyId: string): Promise<WorkspaceTabState | "changed"> {
    const result = await getWorkspaceTabStateAction({ companyId });
    if (result.ok) return result.data.state;

    return notifyIfWorkspaceChanged(result) ? "changed" : "current";
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
