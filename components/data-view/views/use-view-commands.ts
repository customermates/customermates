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
  captureOverlayFocusTarget,
  focusOverlayTarget,
  usableOverlayFocusTarget,
} from "@/components/ui/overlay-focus-target";

import {
  createViewFromCurrent,
  deleteView,
  duplicateView,
  moveView,
  selectView,
  surfaceKeyOf,
  updateViewMeta,
  viewLink,
} from "./view-actions";

export type ViewMetaDraft = {
  mode: ViewMetaMode;
  name: string;
  viewId?: string;
};

export type ViewCommands = {
  copyLink: (view: DataViewChipDto) => void;
  duplicate: (view: DataViewChipDto) => void;
  edit: (view: DataViewChipDto) => void;
  move: (view: DataViewChipDto, offset: -1 | 1) => void;
  remove: (view: DataViewChipDto) => void;
  select: (viewKey: string) => void;
  submitMeta: (draft: ViewMetaDraft, values: { name: string }) => Promise<void>;
};

export type ViewDeleteNotice = { message: string; details: string[] };

export function useViewCommands<E extends HasId>(args: {
  closeMeta: () => void;
  deleteNotice?: (view: DataViewChipDto) => ViewDeleteNotice;
  openMeta: (draft: ViewMetaDraft) => void;
  pathname: string;
  store: BaseDataViewStore<E>;
  owningRail: () => HTMLElement | null;
}): ViewCommands {
  const { closeMeta, deleteNotice, openMeta, pathname, store, owningRail } = args;
  const t = useTranslations();
  const { showConfirmation, showDeleteConfirmation } = useDeleteConfirmation();

  function viewById(viewId: string | undefined): DataViewChipDto | undefined {
    return store.views.find((candidate) => candidate.id === viewId);
  }

  return {
    copyLink: (view) =>
      runUserAction(async () => {
        if (
          await copyToClipboard(
            viewLink(store.viewPathname ?? pathname, view.id, store.viewPathname ? surfaceKeyOf(store) : undefined),
          )
        )
          toast.success(t("DataView.views.linkCopied"));
      }),

    duplicate: (view) =>
      openMeta({
        mode: "duplicate",
        name: t("DataView.views.duplicateName", { name: view.name }),
        viewId: view.id,
      }),

    edit: (view) => openMeta({ mode: "edit", name: view.name, viewId: view.id }),

    move: (view, offset) => runUserAction(() => moveView(store, view, offset)),

    remove: (view) => {
      const rail = owningRail();
      const focusAfterConfirm = () => {
        if (!rail || owningRail() !== rail) return false;
        const target = usableOverlayFocusTarget(rail.querySelector("#global-data-views-all"));
        if (!target || !rail.contains(target)) return false;
        return focusOverlayTarget(captureOverlayFocusTarget(target));
      };
      const onConfirm = () => deleteView(store, view);
      const onRestored = () => store.refresh();
      const notice = deleteNotice?.(view);
      if (notice) {
        showConfirmation({
          title: t("Common.deleteConfirmation.title"),
          ...notice,
          focusAfterConfirm,
          onConfirm,
          onRestored,
        });
      } else showDeleteConfirmation(onConfirm, view.name, focusAfterConfirm, onRestored);
    },

    select: (viewKey) => runUserAction(() => selectView(store, viewKey, pathname)),

    submitMeta: async (draft, values) => {
      const source = viewById(draft.viewId);

      if (draft.mode === "edit") {
        if (!source) return;
        if (!(await updateViewMeta(store, source, { name: values.name }))) return;

        await store.refresh();
        closeMeta();
        return;
      }

      const created =
        draft.mode === "duplicate" && source
          ? await duplicateView(store, source, values)
          : await createViewFromCurrent(store, values);
      if (!created) return;

      closeMeta();
      selectView(store, created.id, pathname);
    },
  };
}
