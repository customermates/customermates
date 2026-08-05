"use client";

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

type Props = {
  open: boolean;
  onCancel: () => void;
  onConfirm: () => void;
};

export function UnsavedChangesGuard({ open, onCancel, onConfirm }: Props) {
  const t = useTranslations();

  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onCancel();
      }}
    >
      <AlertDialogContent className="flex flex-col gap-0 border-0 bg-transparent p-0 shadow-none" size="sm">
        <AppCard>
          <AppCardHeader>
            <AlertDialogTitle className="text-base font-semibold">{t("Common.navigationGuard.title")}</AlertDialogTitle>
          </AppCardHeader>

          <AppCardBody>
            <AlertDialogDescription className="text-sm text-foreground">
              {t("Common.navigationGuard.message")}
            </AlertDialogDescription>
          </AppCardBody>

          <AppCardFooter>
            <AlertDialogCancel onClick={onCancel}>{t("Common.actions.cancel")}</AlertDialogCancel>

            <AlertDialogAction variant="destructive" onClick={onConfirm}>
              {t("Common.actions.discard")}
            </AlertDialogAction>
          </AppCardFooter>
        </AppCard>
      </AlertDialogContent>
    </AlertDialog>
  );
}
