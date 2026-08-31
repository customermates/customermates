"use client";

import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";

import { AppCard } from "@/components/card/app-card";
import { AppCardBody } from "@/components/card/app-card-body";
import { AppCardFooter } from "@/components/card/app-card-footer";
import { AppCardHeader } from "@/components/card/app-card-header";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useOverlayFocusReturn } from "@/components/ui/use-overlay-focus-return";
import { useRootStore } from "@/core/stores/root-store.provider";
import { runUserAction } from "@/core/errors/report-application-error";

export const DeleteConfirmationModal = observer(() => {
  const t = useTranslations();
  const { deleteConfirmationModalStore: store } = useRootStore();
  const { isLoading, form, close } = store;
  const title = form.title || t("Common.deleteConfirmation.title");
  const focusReturn = useOverlayFocusReturn(store.isOpen);

  return (
    <AlertDialog
      open={store.isOpen}
      onOpenChange={(next) => {
        if (!next) close();
      }}
    >
      <AlertDialogContent
        className="flex flex-col gap-0 border-0 bg-transparent p-0 shadow-none"
        size="sm"
        {...focusReturn}
      >
        <AppCard>
          <AppCardHeader>
            <AlertDialogTitle className="text-base font-semibold">{title}</AlertDialogTitle>
          </AppCardHeader>

          <AppCardBody>
            <AlertDialogDescription className="text-sm text-foreground">
              {form.message || t("Common.deleteConfirmation.message")}
            </AlertDialogDescription>
          </AppCardBody>

          <AppCardFooter>
            <AlertDialogCancel disabled={isLoading} id="confirm-delete-cancel">
              {t("Common.actions.cancel")}
            </AlertDialogCancel>

            <AlertDialogAction
              disabled={isLoading}
              id="confirm-delete"
              variant={form.confirmVariant ?? "destructive"}
              onClick={(event) => {
                event.preventDefault();
                runUserAction(() => store.onSubmit());
              }}
            >
              {form.confirmLabel || t("Common.actions.delete")}
            </AlertDialogAction>
          </AppCardFooter>
        </AppCard>
      </AlertDialogContent>
    </AlertDialog>
  );
});
