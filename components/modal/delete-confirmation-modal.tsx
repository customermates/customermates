"use client";

import { useId, useState } from "react";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useOverlayFocusReturn } from "@/components/ui/use-overlay-focus-return";
import { useRootStore } from "@/core/stores/root-store.provider";
import { runUserAction } from "@/core/errors/report-application-error";

export const DeleteConfirmationModal = observer(() => {
  const t = useTranslations();
  const { deleteConfirmationModalStore: store } = useRootStore();
  const { isLoading, form, close } = store;
  const title = form.title || t("Common.deleteConfirmation.title");
  const focusReturn = useOverlayFocusReturn(store.isOpen);
  const confirmationId = useId();
  const [typed, setTyped] = useState({ form, value: "" });
  const typedValue = typed.form === form ? typed.value : "";
  const blocked =
    Boolean(form.blockers?.length) ||
    (form.confirmationText !== undefined && typedValue.trim() !== form.confirmationText.trim());

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
        onCloseAutoFocus={(event) => {
          if (store.restoreConfirmedFocus()) event.preventDefault();
          else focusReturn.onCloseAutoFocus(event);
        }}
      >
        <AppCard>
          <AppCardHeader>
            <AlertDialogTitle className="text-base font-semibold">{title}</AlertDialogTitle>
          </AppCardHeader>

          <AppCardBody>
            <AlertDialogDescription className="text-sm text-foreground">
              {form.message || t("Common.deleteConfirmation.message")}
            </AlertDialogDescription>

            {form.details?.length ? (
              <ul className="mt-3 list-disc space-y-1 ps-5 text-sm" data-delete-confirmation-details="">
                {form.details.map((detail) => (
                  <li key={detail}>{detail}</li>
                ))}
              </ul>
            ) : null}

            {form.blockers?.length ? (
              <div className="mt-3 space-y-1 text-sm" data-delete-confirmation-blockers="">
                <p className="font-medium text-destructive">{t("Common.deleteConfirmation.blocked")}</p>

                <ul className="list-disc space-y-1 ps-5">
                  {form.blockers.map((blocker) => (
                    <li key={blocker}>{blocker}</li>
                  ))}
                </ul>
              </div>
            ) : form.confirmationText !== undefined ? (
              <div className="mt-4 space-y-2">
                <Label htmlFor={confirmationId}>
                  {t("Common.deleteConfirmation.typeToConfirm", { name: form.confirmationText })}
                </Label>

                <Input
                  autoComplete="off"
                  disabled={isLoading}
                  id={confirmationId}
                  value={typedValue}
                  onChange={(event) => setTyped({ form, value: event.target.value })}
                />
              </div>
            ) : null}
          </AppCardBody>

          <AppCardFooter>
            <AlertDialogCancel disabled={isLoading} id="confirm-delete-cancel">
              {t("Common.actions.cancel")}
            </AlertDialogCancel>

            <AlertDialogAction
              disabled={isLoading || blocked}
              id="confirm-delete"
              variant={form.confirmVariant || "destructive"}
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
