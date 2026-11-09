"use client";

import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";

import { AppCard } from "@/components/card/app-card";
import { AppCardFooter } from "@/components/card/app-card-footer";
import { Button } from "@/components/ui/button";
import { AppModal } from "@/components/modal";
import { AppLink } from "@/components/shared/app-link";
import { UpsellCardBody, UpsellCardHeader } from "@/components/shared/upsell-card";
import { useRootStore } from "@/core/stores/root-store.provider";
import { billingHref } from "@/app/components/navigation/settings-routes";
import { planUpsellHighlights } from "@/app/components/upsell/plan-upsell-highlights";
import { UpsellHighlights } from "@/app/components/upsell/upsell-highlights";
import { UpsellInboxPreview } from "@/app/components/upsell/upsell-inbox-preview";
import { UpsellPlanPrice } from "@/app/components/upsell/upsell-plan-price";
import { useCanChangePlan } from "@/app/components/upsell/use-can-change-plan";

export const ConnectUpsellModal = observer(() => {
  const t = useTranslations();
  const { connectUpsellModalStore: store } = useRootStore();
  const { form, isOpen, isLoading, close } = store;
  const canChangePlan = useCanChangePlan();

  const title = t("ConnectedAccountsCard.upsellDialogTitle");
  const planName = t(`Subscription.planNames.${form.plan}`);

  return (
    <AppModal open={isOpen} size="md" title={title} onClose={close}>
      <AppCard data-connect-upsell="">
        <UpsellCardHeader
          eyebrow={<UpsellPlanPrice plan={form.plan} />}
          preview={<UpsellInboxPreview />}
          title={title}
        />

        <UpsellCardBody
          description={
            canChangePlan
              ? form.message || undefined
              : [form.message, t("Upsell.askAdmin", { plan: planName })].filter(Boolean).join(" ")
          }
          highlights={<UpsellHighlights items={planUpsellHighlights(form.plan, t)} />}
        />

        <AppCardFooter>
          <Button disabled={isLoading} type="button" variant="ghost" onClick={close}>
            {t("Common.actions.cancel")}
          </Button>

          {canChangePlan ? (
            <Button asChild variant="ink">
              <AppLink appearance="unstyled" href={billingHref(form.plan)} onClick={close}>
                {t("Upsell.upgradeTo", { plan: planName })}
              </AppLink>
            </Button>
          ) : null}
        </AppCardFooter>
      </AppCard>
    </AppModal>
  );
});
