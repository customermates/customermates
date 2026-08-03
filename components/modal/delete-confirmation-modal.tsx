"use client";

import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useRootStore } from "@/core/stores/root-store.provider";

export const DeleteConfirmationModal = observer(() => {
  const t = useTranslations();
  const { deleteConfirmationModalStore: store } = useRootStore();
  const { isLoading, form, close } = store;
  const title = form.title || t("Common.deleteConfirmation.title");

  return (
    <AlertDialog
      open={store.isOpen}
      onOpenChange={(next) => {
        if (!next) close();
      }}
    >
      <AlertDialogContent size="sm">
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>

          <AlertDialogDescription>{form.message || t("Common.deleteConfirmation.message")}</AlertDialogDescription>
        </AlertDialogHeader>

        <AlertDialogFooter>
          <AlertDialogCancel disabled={isLoading} id="confirm-delete-cancel">
            {t("Common.actions.cancel")}
          </AlertDialogCancel>

          <AlertDialogAction
            disabled={isLoading}
            id="confirm-delete"
            variant="destructive"
            onClick={(event) => {
              event.preventDefault();
              void store.onSubmit();
            }}
          >
            {t("Common.actions.delete")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
});
