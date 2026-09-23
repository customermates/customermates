"use client";

import type { SubscriptionDto } from "@/ee/subscription/get-subscription.interactor";
import type { ChipColor } from "@/constants/chip-colors";

import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";
import { useLayoutEffect } from "react";
import { Action, Resource, SubscriptionStatus, SubscriptionPlan } from "@/generated/prisma";

import { useRootStore } from "@/core/stores/root-store.provider";
import { useHydratedIntlStore } from "@/core/stores/use-hydrated-intl-store";
import { FormOutputField } from "@/components/forms/form-output-field";
import { AppChip } from "@/components/chip/app-chip";
import { Alert } from "@/components/shared/alert";
import { runUserAction } from "@/core/errors/report-application-error";

import { PlanPicker } from "./plan-picker";

type Props = {
  initialSubscription: SubscriptionDto | null;
};

export const SUBSCRIPTION_STATUS_COLOR_MAP: Record<SubscriptionStatus, ChipColor> = {
  [SubscriptionStatus.active]: "success",
  [SubscriptionStatus.trial]: "warning",
  [SubscriptionStatus.expired]: "destructive",
  [SubscriptionStatus.pastDue]: "destructive",
  [SubscriptionStatus.unPaid]: "destructive",
  [SubscriptionStatus.cancelled]: "secondary",
};

export const SubscriptionPanel = observer(({ initialSubscription }: Props) => {
  const t = useTranslations();
  const { subscriptionStore, loadingOverlayStore, userStore } = useRootStore();
  const intlStore = useHydratedIntlStore();

  useLayoutEffect(() => subscriptionStore.setSubscription(initialSubscription), [initialSubscription]);

  const subscription = subscriptionStore.subscription ?? initialSubscription;
  const isManaged = subscription?.plan === SubscriptionPlan.enterprise;
  const seats = subscription?.quantity ?? subscription?.activeUsers ?? 0;
  const hasActiveSubscription = subscription?.hasActiveSubscription ?? false;
  const canManageBilling = userStore.can(Resource.company, Action.update);
  const hasBillingPortal = Boolean(subscription?.hasBillingPortal);
  const planHelp = !hasActiveSubscription
    ? canManageBilling
      ? t("Subscription.fieldHelp.planPicker")
      : t("Subscription.fieldHelp.planReadOnly")
    : !canManageBilling
      ? t("Subscription.fieldHelp.planReadOnly")
      : hasBillingPortal
        ? t("Subscription.fieldHelp.planManage", { billing: t("Subscription.manageWithLemonSqueezy") })
        : t("Subscription.fieldHelp.planUnavailable");
  const currentPeriodEndHelp = !canManageBilling
    ? t("Subscription.fieldHelp.currentPeriodEndReadOnly")
    : hasBillingPortal
      ? t("Subscription.fieldHelp.currentPeriodEndManage", { billing: t("Subscription.manageWithLemonSqueezy") })
      : t("Subscription.fieldHelp.currentPeriodEndUnavailable");
  const trialEndHelp = !hasActiveSubscription
    ? canManageBilling
      ? t("Subscription.fieldHelp.trialEndsPicker")
      : t("Subscription.fieldHelp.trialEndsReadOnly")
    : !canManageBilling
      ? t("Subscription.fieldHelp.trialEndsReadOnly")
      : hasBillingPortal
        ? t("Subscription.fieldHelp.trialEndsManage", { billing: t("Subscription.manageWithLemonSqueezy") })
        : t("Subscription.fieldHelp.trialEndsUnavailable");

  return (
    <section className="flex w-full flex-col gap-4">
      {isManaged && <Alert color="primary" description={t("Subscription.managedExternallyNote")} />}

      <FormOutputField help={isManaged ? undefined : planHelp} label={t("Subscription.plan")}>
        <span className="flex w-full items-center justify-between gap-2">
          <span>{t(`Subscription.planNames.${subscription?.plan ?? SubscriptionPlan.pro}`)}</span>

          <AppChip
            className="shrink-0"
            size="sm"
            variant={subscription ? SUBSCRIPTION_STATUS_COLOR_MAP[subscription.status] : "default"}
          >
            {t(`Subscription.status.${subscription?.status ?? SubscriptionStatus.trial}`)}
          </AppChip>
        </span>
      </FormOutputField>

      {!isManaged && (
        <>
          <div className="grid w-full grid-cols-1 gap-3">
            {subscription?.trialEndDate && subscription.status === SubscriptionStatus.trial && (
              <FormOutputField help={trialEndHelp} label={t("Subscription.trialEnds")}>
                {intlStore.formatDescriptiveLongDate(subscription.trialEndDate)}
              </FormOutputField>
            )}

            {subscription?.currentPeriodEnd && (
              <FormOutputField help={currentPeriodEndHelp} label={t("Subscription.currentPeriodEnd")}>
                {intlStore.formatDescriptiveLongDate(subscription.currentPeriodEnd)}
              </FormOutputField>
            )}

            <FormOutputField
              description={t("Subscription.seatBillingNote")}
              help={t("Subscription.fieldHelp.quantity", { company: t("UserAvatar.company") })}
              label={t("Subscription.quantity")}
            >
              {seats.toString()}
            </FormOutputField>
          </div>

          {!hasActiveSubscription && canManageBilling && (
            <PlanPicker
              isLoading={loadingOverlayStore.isLoading}
              onSelect={(plan) => runUserAction(() => subscriptionStore.handleSubscribe(plan))}
            />
          )}
        </>
      )}
    </section>
  );
});
