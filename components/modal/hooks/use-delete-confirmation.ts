import type { DeleteConfirmationData } from "../delete-confirmation-modal.store";

import { useTranslations } from "next-intl";

import { useRootStore } from "@/core/stores/root-store.provider";

export function useDeleteConfirmation() {
  const t = useTranslations();
  const { deleteConfirmationModalStore } = useRootStore();

  function showDeleteConfirmation(
    onConfirm: () => Promise<boolean>,
    entityName?: string,
    focusAfterConfirm?: () => boolean,
  ) {
    const data: DeleteConfirmationData = {
      title: t("Common.deleteConfirmation.title"),
      message: entityName
        ? t("Common.deleteConfirmation.messageWithName", { name: entityName })
        : t("Common.deleteConfirmation.message"),
      entityName,
      focusAfterConfirm,
      onConfirm,
    };

    deleteConfirmationModalStore.onInitOrRefresh(data);
    deleteConfirmationModalStore.open();
  }

  function showConfirmation(data: Omit<DeleteConfirmationData, "entityName">) {
    deleteConfirmationModalStore.onInitOrRefresh({
      ...data,
      focusAfterConfirm: data.focusAfterConfirm,
      entityName: undefined,
    });
    deleteConfirmationModalStore.open();
  }

  return { showConfirmation, showDeleteConfirmation };
}
