"use client";

import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";

import { AppCard } from "@/components/card/app-card";
import { AppCardBody } from "@/components/card/app-card-body";
import { AppCardFooter } from "@/components/card/app-card-footer";
import { AppCardHeader } from "@/components/card/app-card-header";
import { Button } from "@/components/ui/button";
import { AppModal } from "@/components/modal";
import { AppLink } from "@/components/shared/app-link";
import { useRootStore } from "@/core/stores/root-store.provider";

export const ConnectUpsellModal = observer(() => {
  const t = useTranslations();
  const { connectUpsellModalStore: store } = useRootStore();
  const { form, isOpen, isLoading, close } = store;

  const title = t("ConnectedAccountsCard.upsellDialogTitle");

  return (
    <AppModal open={isOpen} size="sm" title={title} onClose={close}>
      <AppCard>
        <AppCardHeader>
          <h2 className="text-base font-semibold">{title}</h2>
        </AppCardHeader>

        <AppCardBody>
          <p className="text-sm">{form.message}</p>
        </AppCardBody>

        <AppCardFooter>
          <Button disabled={isLoading} type="button" variant="outline" onClick={close}>
            {t("Common.actions.cancel")}
          </Button>

          <AppLink href="/company/subscription" onClick={close}>
            <Button type="button">{t("ConnectedAccountsCard.viewPlansCta")}</Button>
          </AppLink>
        </AppCardFooter>
      </AppCard>
    </AppModal>
  );
});
