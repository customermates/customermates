"use client";

import type { SubscriptionDto } from "@/ee/subscription/get-subscription.interactor";
import type { ReactNode } from "react";
import type { ChipColor } from "@/constants/chip-colors";

import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";
import { useLayoutEffect } from "react";
import { SubscriptionStatus, SubscriptionPlan } from "@/generated/prisma";

import { useRootStore } from "@/core/stores/root-store.provider";
import { useHydratedIntlStore } from "@/core/stores/use-hydrated-intl-store";
import { FormLabel } from "@/components/forms/form-label";
import { AppChip } from "@/components/chip/app-chip";
import { Alert } from "@/components/shared/alert";
import { cn } from "@/core/utils/cn";
import { runUserAction } from "@/core/errors/report-application-error";

import { PlanPicker } from "./plan-picker";

type Props = {
  initialSubscription: SubscriptionDto | null;
};

const STATUS_COLOR_MAP: Record<SubscriptionStatus, ChipColor> = {
  [SubscriptionStatus.active]: "success",
  [SubscriptionStatus.trial]: "warning",
  [SubscriptionStatus.expired]: "destructive",
  [SubscriptionStatus.pastDue]: "destructive",
  [SubscriptionStatus.unPaid]: "destructive",
  [SubscriptionStatus.cancelled]: "secondary",
};

function ReadOnlyField({
  label,
  description,
  children,
  className,
}: {
  label: string;
  description?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <FormLabel>{label}</FormLabel>

      <div className="flex h-9 w-full items-center rounded-md border border-input bg-muted px-3 py-1.5 text-sm shadow-xs">
        {children}
      </div>

      {description && <p className="text-xs text-muted-foreground">{description}</p>}
    </div>
  );
}

export const SubscriptionPanel = observer(({ initialSubscription }: Props) => {
  const t = useTranslations();
  const { subscriptionStore, loadingOverlayStore } = useRootStore();
  const intlStore = useHydratedIntlStore();

  useLayoutEffect(() => subscriptionStore.setSubscription(initialSubscription), [initialSubscription]);

  const subscription = subscriptionStore.subscription ?? initialSubscription;
  const isManaged = subscription?.plan === SubscriptionPlan.enterprise;
  const seats = subscription?.quantity ?? subscription?.activeUsers ?? 0;
  const hasActiveSubscription = subscription?.hasActiveSubscription ?? false;

  return (
    <section className="flex w-full flex-col gap-4">
      {isManaged && <Alert color="primary" description={t("Subscription.managedExternallyNote")} />}

      <ReadOnlyField label={t("Subscription.plan")}>
        <span className="flex w-full items-center justify-between gap-2">
          <span>{t(`Subscription.planNames.${subscription?.plan ?? SubscriptionPlan.pro}`)}</span>

          <AppChip
            className="shrink-0"
            size="sm"
            variant={subscription ? STATUS_COLOR_MAP[subscription.status] : "default"}
          >
            {t(`Subscription.status.${subscription?.status ?? SubscriptionStatus.trial}`)}
          </AppChip>
        </span>
      </ReadOnlyField>

      {!isManaged && (
        <>
          <div className="grid w-full grid-cols-1 gap-3">
            {subscription?.trialEndDate && subscription.status === SubscriptionStatus.trial && (
              <ReadOnlyField label={t("Subscription.trialEnds")}>
                {intlStore.formatDescriptiveLongDate(subscription.trialEndDate)}
              </ReadOnlyField>
            )}

            {subscription?.currentPeriodEnd && (
              <ReadOnlyField label={t("Subscription.currentPeriodEnd")}>
                {intlStore.formatDescriptiveLongDate(subscription.currentPeriodEnd)}
              </ReadOnlyField>
            )}

            <ReadOnlyField description={t("Subscription.seatBillingNote")} label={t("Subscription.quantity")}>
              {seats.toString()}
            </ReadOnlyField>
          </div>

          {!hasActiveSubscription && (
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
