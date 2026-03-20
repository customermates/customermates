"use client";

import type { BaseModalStore } from "@/core/base/base-modal.store";

import { Button } from "@heroui/button";
import { useTranslations } from "next-intl";
import { observer } from "mobx-react-lite";

import { XModal } from "../../components/x-modal/x-modal";

import { XCardBody } from "@/components/x-card/x-card-body";
import { XCard } from "@/components/x-card/x-card";
import { XCardFooter } from "@/components/x-card/x-card-footer";
import { XCardHeader } from "@/components/x-card/x-card-header";

type Props = {
  store: BaseModalStore;
};

export const AssigneeGuardModal = observer(({ store }: Props) => {
  const t = useTranslations("Common");

  if (!store) return null;

  return (
    <XModal isOpen={store.isSubmittingWithGuard} onClose={() => store.setIsSubmittingWithGuard(false)}>
      <XCard>
        <XCardHeader>
          <h2 className="text-x-lg">{t("assigneeGuard.title")}</h2>
        </XCardHeader>

        <XCardBody>
          <p className="text-x-sm">{t("assigneeGuard.message")}</p>
        </XCardBody>

        <XCardFooter>
          <Button variant="flat" onPress={() => store.setIsSubmittingWithGuard(false)}>
            {t("actions.cancel")}
          </Button>
        </XCardFooter>
      </XCard>
    </XModal>
  );
});
