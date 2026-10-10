import type { RootStore } from "@/core/stores/root.store";
import type { SidebarLayout } from "@/features/p13n/sidebar-layout.schema";

import { action, makeObservable, observable } from "mobx";

import { upsertP13nAction } from "@/app/actions";
import { reportApplicationError } from "@/core/errors/report-application-error";
import { toastZodErrorTree } from "@/core/utils/toast-zod-error-tree";
import { SIDEBAR_P13N_ID } from "@/features/p13n/sidebar-layout.schema";

export class SidebarLayoutStore {
  layout: SidebarLayout | null = null;
  editingSection: string | null = null;
  private confirmed: SidebarLayout | null = null;
  private pending = 0;
  private saving: Promise<unknown> = Promise.resolve();

  constructor(private root: RootStore) {
    makeObservable(this, {
      layout: observable.ref,
      editingSection: observable,
      setLayout: action,
      setEditingSection: action,
      save: action,
    });
  }

  setLayout = (layout: SidebarLayout | null) => {
    if (this.pending > 0) return;
    this.layout = layout;
    this.confirmed = layout;
  };

  setEditingSection = (sectionId: string | null) => {
    this.editingSection = sectionId;
  };

  save = (layout: SidebarLayout | null) => {
    const userId = this.root.userStore.user?.id;
    this.layout = layout;
    this.pending += 1;
    const saved = this.saving
      .then(async () => {
        if (!userId || userId !== this.root.userStore.user?.id) return false;
        const result = await upsertP13nAction({ p13nId: SIDEBAR_P13N_ID, settings: layout });
        if (result.ok) {
          this.confirmed = layout;
          return true;
        }
        toastZodErrorTree(result.error);
        this.rollBack();
        return false;
      })
      .catch((error: unknown) => {
        this.rollBack();
        reportApplicationError(error);
        return false;
      })
      .finally(() => {
        this.pending -= 1;
      });
    this.saving = saved;
    return saved;
  };

  private rollBack = action(() => {
    this.layout = this.confirmed;
  });
}
