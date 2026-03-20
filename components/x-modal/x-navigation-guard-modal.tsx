"use client";

import { Button } from "@heroui/button";
import { useTranslations } from "next-intl";

import { XModal } from "@/components/x-modal/x-modal";
import { XCardBody } from "@/components/x-card/x-card-body";
import { XCard } from "@/components/x-card/x-card";
import { XCardFooter } from "@/components/x-card/x-card-footer";
import { XCardHeader } from "@/components/x-card/x-card-header";

type Props = {
  open: boolean;
  onCancel: () => void;
  onConfirm: () => void;
};

export function XNavigationGuardModal({ open, onCancel, onConfirm }: Props) {
  const t = useTranslations("Common");

  return (
    <XModal isOpen={open} onClose={onCancel}>
      <XCard>
        <XCardHeader>
          <h2 className="text-x-lg">{t("navigationGuard.title")}</h2>
        </XCardHeader>

        <XCardBody>
          <p className="text-x-sm">{t("navigationGuard.message")}</p>
        </XCardBody>

        <XCardFooter>
          <Button variant="flat" onPress={onCancel}>
            {t("actions.cancel")}
          </Button>

          <Button color="danger" onPress={onConfirm}>
            {t("actions.discard")}
          </Button>
        </XCardFooter>
      </XCard>
    </XModal>
  );
}
