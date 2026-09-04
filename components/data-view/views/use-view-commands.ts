"use client";

import type { BaseDataViewStore, HasId } from "@/core/base/base-data-view.store";
import type { DataViewChipDto } from "@/core/data-view/data-view-state.schema";
import type { ViewMetaMode } from "./view-meta-overlay";

import { toast } from "sonner";
import { useTranslations } from "next-intl";

import { copyToClipboard } from "@/core/utils/clipboard";
import { runUserAction } from "@/core/errors/report-application-error";
import { useDeleteConfirmation } from "@/components/modal/hooks/use-delete-confirmation";

import {
  createViewFromCurrent,
  deleteView,
  duplicateView,
  moveView,
  saveViewFromCurrent,
  selectView,
  updateViewMeta,
  viewLink,
} from "./view-actions";

export type ViewMetaDraft = {
  isShared: boolean;
  mode: ViewMetaMode;
  name: string;
  viewId?: string;
};

export type ViewCommitCommands = {
  reset: () => void;
  saveChanges: (view: DataViewChipDto) => void;
};

export type ViewCommands = ViewCommitCommands & {
  copyLink: (view: DataViewChipDto) => void;
  create: () => void;
  duplicate: (view: DataViewChipDto) => void;
  edit: (view: DataViewChipDto) => void;
  move: (view: DataViewChipDto, offset: -1 | 1) => void;
  remove: (view: DataViewChipDto) => void;
  select: (viewKey: string) => void;
  submitMeta: (draft: ViewMetaDraft, values: { isShared: boolean; name: string }) => Promise<void>;
  toggleShare: (view: DataViewChipDto) => void;
};

export function useViewCommitCommands<E extends HasId>(store: BaseDataViewStore<E>): ViewCommitCommands {
  const t = useTranslations();
  const { showConfirmation } = useDeleteConfirmation();

  return {
    reset: () => runUserAction(() => store.resetView()),

    saveChanges: (view) => {
      if (view.visibility !== "workspace") {
        runUserAction(() => saveViewFromCurrent(store, view));
        return;
      }

      showConfirmation({
        confirmLabel: t("Common.actions.save"),
        confirmVariant: "default",
        message: t("DataView.views.saveShared"),
        successKey: "Common.notifications.updated",
        title: t("DataView.views.saveChanges"),
        onConfirm: () => saveViewFromCurrent(store, view),
      });
    },
  };
}

export function useViewCommands<E extends HasId>(args: {
  closeMeta: () => void;
  openMeta: (draft: ViewMetaDraft) => void;
  pathname: string;
  store: BaseDataViewStore<E>;
}): ViewCommands {
  const { closeMeta, openMeta, pathname, store } = args;
  const t = useTranslations();
  const { showConfirmation, showDeleteConfirmation } = useDeleteConfirmation();
  const commit = useViewCommitCommands(store);

  function viewById(viewId: string | undefined): DataViewChipDto | undefined {
    return store.views.find((candidate) => candidate.id === viewId);
  }

  function confirmUnshare(onConfirm: () => Promise<boolean>): void {
    showConfirmation({
      confirmLabel: t("Common.actions.confirm"),
      confirmVariant: "default",
      message: t("DataView.views.unshareWarning"),
      successKey: "Common.notifications.updated",
      title: t("DataView.views.shared"),
      onConfirm,
    });
  }

  return {
    ...commit,

    copyLink: (view) =>
      runUserAction(async () => {
        if (await copyToClipboard(viewLink(pathname, view.id))) toast.success(t("DataView.views.linkCopied"));
      }),

    create: () => openMeta({ isShared: false, mode: "create", name: "" }),

    duplicate: (view) =>
      openMeta({
        isShared: false,
        mode: "duplicate",
        name: t("DataView.views.duplicateName", { name: view.name }),
        viewId: view.id,
      }),

    edit: (view) =>
      openMeta({
        isShared: view.visibility === "workspace",
        mode: "edit",
        name: view.name,
        viewId: view.id,
      }),

    move: (view, offset) => runUserAction(() => moveView(store, view, offset)),

    remove: (view) =>
      showDeleteConfirmation(async () => {
        const removed = await deleteView(store, view);
        if (removed) document.getElementById("global-data-views-all")?.focus();
        return removed;
      }, view.name),

    select: (viewKey) => runUserAction(() => selectView(store, viewKey, pathname)),

    submitMeta: async (draft, values) => {
      const source = viewById(draft.viewId);

      if (draft.mode === "edit") {
        if (!source) return;

        const applyEdit = async () => {
          const updated = await updateViewMeta(store, source, {
            name: values.name,
            visibility: values.isShared ? "workspace" : "private",
          });
          if (!updated) return false;

          await store.refresh();
          closeMeta();
          return true;
        };

        if (source.visibility === "workspace" && !values.isShared) {
          confirmUnshare(applyEdit);
          return;
        }

        await applyEdit();
        return;
      }

      const created =
        draft.mode === "duplicate" && source
          ? await duplicateView(store, source, { isShared: values.isShared, name: values.name })
          : await createViewFromCurrent(store, values);
      if (!created) return;

      closeMeta();
      selectView(store, created.id, pathname);
    },

    toggleShare: (view) => {
      const isShared = view.visibility === "workspace";

      const apply = async () => {
        if (!(await updateViewMeta(store, view, { visibility: isShared ? "private" : "workspace" }))) return false;

        await store.refresh();
        return true;
      };

      if (!isShared) {
        runUserAction(apply);
        return;
      }

      confirmUnshare(apply);
    },
  };
}
