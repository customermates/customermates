"use client";

import type { SubscriptionDto } from "@/ee/subscription/get-subscription.interactor";
import type { FileStorageUsageDto } from "@/features/record-files/record-file.schema";
import type { ChipColor } from "@/constants/chip-colors";
import type { PlanUsageDto } from "@/ee/subscription/get-plan-usage.interactor";
import type { PurchasablePlanId } from "@/core/commercial/plan-catalog";

import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";
import { useEffect, useLayoutEffect } from "react";
import { Action, Resource, SubscriptionStatus, SubscriptionPlan } from "@/generated/prisma";

import { useRootStore } from "@/core/stores/root-store.provider";
import { useHydratedIntlStore } from "@/core/stores/use-hydrated-intl-store";
import { FormOutputField } from "@/components/forms/form-output-field";
import { AppChip } from "@/components/chip/app-chip";
import { useRecordFileSize } from "@/components/records/record-file-meta";
import { Alert } from "@/components/shared/alert";
import { reportApplicationError, runUserAction } from "@/core/errors/report-application-error";
import { startBackgroundPoll } from "@/core/utils/background-poll";
import { CHECKOUT_POLL_INTERVAL_MS } from "@/ee/subscription/checkout-state";

import { PlanSelection } from "./plan-selection";
import { PlanUsageCard } from "@/app/components/upsell/plan-usage-card";
import { StorageUpsellNote } from "@/app/components/upsell/storage-upsell-note";
import { FREE_PLAN_ID } from "@/core/commercial/plan-catalog";

type Props = {
  initialSubscription: SubscriptionDto | null;
  storage: FileStorageUsageDto | null;
  usage?: PlanUsageDto | null;
  focusPlan?: PurchasablePlanId;
  recommendedPlan?: PurchasablePlanId | null;
};

export const SUBSCRIPTION_STATUS_COLOR_MAP: Record<SubscriptionStatus, ChipColor> = {
  [SubscriptionStatus.active]: "success",
  [SubscriptionStatus.trial]: "warning",
  [SubscriptionStatus.expired]: "destructive",
  [SubscriptionStatus.pastDue]: "destructive",
  [SubscriptionStatus.unPaid]: "destructive",
  [SubscriptionStatus.cancelled]: "secondary",
};

export const SubscriptionPanel = observer((props: Props) => {
  const { initialSubscription, storage, usage = null, focusPlan, recommendedPlan = null } = props;
  const t = useTranslations();
  const { subscriptionStore, loadingOverlayStore, userStore } = useRootStore();
  const intlStore = useHydratedIntlStore();

  useLayoutEffect(() => subscriptionStore.setSubscription(initialSubscription), [initialSubscription]);

  const subscription = subscriptionStore.subscription ?? initialSubscription;
  const isManaged = subscription?.plan === SubscriptionPlan.enterprise;
  const onFreePlan = subscription?.onFreePlan ?? false;
  const planKey = onFreePlan ? FREE_PLAN_ID : (subscription?.plan ?? SubscriptionPlan.pro);
  const seats = subscription?.quantity ?? subscription?.activeUsers ?? 0;
  const hasActiveSubscription = subscription?.hasActiveSubscription ?? false;
  const canManageCompany = userStore.can(Resource.company, Action.update);
  const hasBillingPortal = Boolean(subscription?.hasBillingPortal);
  const checkout = subscription?.checkout ?? "none";
  const awaitingPayment = checkout === "pending" && !hasActiveSubscription && canManageCompany;
  const planHelp = !hasActiveSubscription
    ? canManageCompany
      ? t("Subscription.fieldHelp.planPicker")
      : t("Subscription.fieldHelp.planReadOnly")
    : !canManageCompany
      ? t("Subscription.fieldHelp.planReadOnly")
      : t("Subscription.fieldHelp.planManage", { billing: t("Subscription.manageWithLemonSqueezy") });
  const currentPeriodEndHelp = !canManageCompany
    ? t("Subscription.fieldHelp.currentPeriodEndReadOnly")
    : hasBillingPortal
      ? t("Subscription.fieldHelp.currentPeriodEndManage", { billing: t("Subscription.manageWithLemonSqueezy") })
      : t("Subscription.fieldHelp.currentPeriodEndUnavailable");
  const sizeLabel = useRecordFileSize();
  const trialEndHelp = !hasActiveSubscription
    ? canManageCompany
      ? t("Subscription.fieldHelp.trialEndsPicker")
      : t("Subscription.fieldHelp.trialEndsReadOnly")
    : !canManageCompany
      ? t("Subscription.fieldHelp.trialEndsReadOnly")
      : t("Subscription.fieldHelp.trialEndsManage", { billing: t("Subscription.manageWithLemonSqueezy") });
  const storageRow =
    storage?.limitBytes && !onFreePlan ? (
      <FormOutputField
        description={storage.usedBytes >= storage.limitBytes ? <StorageUpsellNote plan={planKey} /> : undefined}
        help={t("Subscription.fieldHelp.fileStorage")}
        label={t("Subscription.fileStorage")}
      >
        {t("Subscription.fileStorageUsage", {
          used: sizeLabel(storage.usedBytes),
          limit: sizeLabel(storage.limitBytes),
        })}
      </FormOutputField>
    ) : null;

  useEffect(() => {
    if (!awaitingPayment) return;
    return startBackgroundPoll({
      refresh: () => subscriptionStore.reloadSubscription(),
      onError: reportApplicationError,
      intervalMs: CHECKOUT_POLL_INTERVAL_MS,
    });
  }, [awaitingPayment, subscriptionStore]);

  return (
    <section className="flex w-full flex-col gap-4">
      {isManaged && <Alert description={t("Subscription.managedExternallyNote")} variant="info" />}

      <FormOutputField help={isManaged ? undefined : planHelp} label={t("Subscription.plan")}>
        <span className="flex w-full items-center justify-between gap-2">
          <span>{t(`Subscription.planNames.${planKey}`)}</span>

          {onFreePlan ? (
            <AppChip className="shrink-0" size="sm" variant="secondary">
              {t("Subscription.currentPlan")}
            </AppChip>
          ) : (
            <AppChip
              className="shrink-0"
              size="sm"
              variant={subscription ? SUBSCRIPTION_STATUS_COLOR_MAP[subscription.status] : "default"}
            >
              {t(`Subscription.status.${subscription?.status ?? SubscriptionStatus.trial}`)}
            </AppChip>
          )}
        </span>
      </FormOutputField>

      {isManaged && storageRow}

      {!isManaged && (
        <>
          <div className="grid w-full grid-cols-1 gap-3">
            {subscription?.trialEndDate && subscription.status === SubscriptionStatus.trial && !onFreePlan && (
              <FormOutputField help={trialEndHelp} label={t("Subscription.trialEnds")}>
                {intlStore.formatDescriptiveLongDate(subscription.trialEndDate)}
              </FormOutputField>
            )}

            {subscription?.currentPeriodEnd && (
              <FormOutputField help={currentPeriodEndHelp} label={t("Subscription.currentPeriodEnd")}>
                {intlStore.formatDescriptiveLongDate(subscription.currentPeriodEnd)}
              </FormOutputField>
            )}

            {!onFreePlan && (
              <FormOutputField
                description={t("Subscription.seatBillingNote")}
                help={t("Subscription.fieldHelp.quantity", { members: t("SettingsNav.members") })}
                label={t("Subscription.quantity")}
              >
                {seats.toString()}
              </FormOutputField>
            )}

            {storageRow}
          </div>

          {onFreePlan && usage ? <PlanUsageCard usage={usage} /> : null}

          {!hasActiveSubscription && canManageCompany && (
            <PlanSelection
              checkout={checkout}
              checkoutSeats={(subscription?.activeUsers ?? 0) + (subscription?.pausedMembers ?? 0)}
              currentFree={onFreePlan}
              focusPlan={focusPlan}
              isLoading={loadingOverlayStore.isLoading}
              pausedSeats={subscription?.pausedMembers ?? 0}
              recommendedPlan={recommendedPlan}
              onAbandon={() => runUserAction(() => subscriptionStore.handleAbandon())}
              onSelect={(plan) => runUserAction(() => subscriptionStore.handleSubscribe(plan))}
            />
          )}
        </>
      )}
    </section>
  );
});
