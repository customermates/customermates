"use client";

import { useTranslations } from "next-intl";

import { AppCard } from "@/components/card/app-card";
import { AppCardBody } from "@/components/card/app-card-body";
import { AppCardFooter } from "@/components/card/app-card-footer";
import { AppCardHeader } from "@/components/card/app-card-header";
import { Button } from "@/components/ui/button";

import { AppModal } from "./app-modal";

type Props = {
  open: boolean;
  onCancel: () => void;
  onConfirm: () => void;
};

export function UnsavedChangesGuard({ open, onCancel, onConfirm }: Props) {
  const t = useTranslations();

  return (
    <AppModal open={open} size="sm" title={t("Common.navigationGuard.title")} onClose={onCancel}>
      <AppCard>
        <AppCardHeader>
          <h2 className="text-base font-semibold">{t("Common.navigationGuard.title")}</h2>
        </AppCardHeader>

        <AppCardBody>
          <p className="text-sm">{t("Common.navigationGuard.message")}</p>
        </AppCardBody>

        <AppCardFooter>
          <Button type="button" variant="outline" onClick={onCancel}>
            {t("Common.actions.cancel")}
          </Button>

          <Button type="button" variant="destructive" onClick={onConfirm}>
            {t("Common.actions.discard")}
          </Button>
        </AppCardFooter>
      </AppCard>
    </AppModal>
  );
}
