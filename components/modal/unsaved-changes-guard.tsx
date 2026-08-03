"use client";

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
      <AlertDialogContent size="sm">
        <AlertDialogHeader>
          <AlertDialogTitle>{t("Common.navigationGuard.title")}</AlertDialogTitle>

          <AlertDialogDescription>{t("Common.navigationGuard.message")}</AlertDialogDescription>
        </AlertDialogHeader>

        <AlertDialogFooter>
          <AlertDialogCancel onClick={onCancel}>{t("Common.actions.cancel")}</AlertDialogCancel>

          <AlertDialogAction variant="destructive" onClick={onConfirm}>
            {t("Common.actions.discard")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
