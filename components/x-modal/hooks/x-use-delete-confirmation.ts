import type { DeleteConfirmationData } from "../x-delete-confirmation-modal.store";

import { useTranslations } from "next-intl";

import { useRootStore } from "@/core/stores/root-store.provider";

export function useDeleteConfirmation() {
  const t = useTranslations("Common");
  const { deleteConfirmationModalStore } = useRootStore();

  function showDeleteConfirmation(onConfirm: () => Promise<void> | void, entityName?: string) {
    const data: DeleteConfirmationData = {
      title: t("deleteConfirmation.title"),
      message: entityName
        ? t("deleteConfirmation.messageWithName", { name: entityName })
        : t("deleteConfirmation.message"),
      entityName,
      onConfirm,
    };

    deleteConfirmationModalStore.onInitOrRefresh(data);
    deleteConfirmationModalStore.open();
  }

  return { showDeleteConfirmation };
}
