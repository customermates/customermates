"use client";

import type { SubscriptionRecoveryPath } from "@/features/auth/subscription-recovery";

import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { AppCard } from "@/components/card/app-card";
import { AppCardBody } from "@/components/card/app-card-body";
import { AppCardFooter } from "@/components/card/app-card-footer";
import { CardHeroHeader } from "@/components/card/card-hero-header";
import { useRootStore } from "@/core/stores/root-store.provider";

import { PlanPicker } from "@/app/[locale]/(protected)/settings/(workspace)/components/subscription/plan-picker";
import { runUserAction } from "@/core/errors/report-application-error";
import { serverRenderedClient } from "@/core/utils/server-rendered-client";
import { contactHref } from "@/core/utils/contact-href";
import { workspaceDisplayName } from "@/app/components/workspaces/workspace-identity";

type Props = {
  recoveryPath: SubscriptionRecoveryPath;
  firstPlan: boolean;
};

const SubscriptionExpiredViewContent = observer(({ recoveryPath, firstPlan }: Props) => {
  const t = useTranslations();
  const { subscriptionExpiredStore, loadingOverlayStore, workspacesStore } = useRootStore();
  const workspaceName = workspaceDisplayName(workspacesStore.current?.name, t("Workspaces.fallbackName"));
  const choosingFirstPlan = firstPlan && recoveryPath === "selfServiceCheckout";
  const description =
    recoveryPath === "selfServiceCheckout"
      ? choosingFirstPlan
        ? t("Workspaces.firstPlan.description", { name: workspaceName })
        : t("SubscriptionExpiredView.selfServiceCheckoutDescription")
      : recoveryPath === "manualEnterpriseBilling"
        ? t("SubscriptionExpiredView.manualEnterpriseBillingDescription")
        : t("SubscriptionExpiredView.administratorRequiredDescription");

  return (
    <AppCard className="max-w-3xl">
      <CardHeroHeader
        subtitle={choosingFirstPlan ? t("Workspaces.firstPlan.subtitle") : t("SubscriptionExpiredView.subtitle")}
        title={
          choosingFirstPlan
            ? t("Workspaces.firstPlan.title", { name: workspaceName })
            : t("SubscriptionExpiredView.title")
        }
      />

      <AppCardBody>
        <p className="text-x-sm text-center text-subdued">{description}</p>

        {recoveryPath === "selfServiceCheckout" ? (
          <PlanPicker
            isLoading={loadingOverlayStore.isLoading}
            onSelect={(plan) => runUserAction(() => subscriptionExpiredStore.handleSubscribe(plan))}
          />
        ) : null}
      </AppCardBody>

      <AppCardFooter>
        <Button
          className="w-full"
          variant="secondary"
          onClick={() => {
            const supportHref = contactHref("email", "mail@customermates.com");
            if (supportHref)
              window.location.href = `${supportHref}?subject=${encodeURIComponent(t("SubscriptionExpiredView.supportEmailSubject"))}`;
          }}
        >
          {t("SubscriptionExpiredView.contactSupportCta")}
        </Button>

        {recoveryPath !== "selfServiceCheckout" ? (
          <Button className="w-full" onClick={() => window.location.reload()}>
            {t("SubscriptionExpiredView.retry")}
          </Button>
        ) : null}
      </AppCardFooter>
    </AppCard>
  );
});

export const SubscriptionExpiredView = serverRenderedClient(SubscriptionExpiredViewContent);
