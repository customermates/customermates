import type { DeleteConfirmationData } from "../delete-confirmation-modal.store";

import { useTranslations } from "next-intl";

import { useRootStore } from "@/core/stores/root-store.provider";

export function useDeleteConfirmation() {
  const t = useTranslations();
  const { deleteConfirmationModalStore } = useRootStore();

  function showDeleteConfirmation(onConfirm: () => Promise<boolean>, entityName?: string) {
    const data: DeleteConfirmationData = {
      title: t("Common.deleteConfirmation.title"),
      message: entityName
        ? t("Common.deleteConfirmation.messageWithName", { name: entityName })
        : t("Common.deleteConfirmation.message"),
      entityName,
      onConfirm,
    };

    deleteConfirmationModalStore.onInitOrRefresh(data);
    deleteConfirmationModalStore.open();
  }

  return { showDeleteConfirmation };
}
