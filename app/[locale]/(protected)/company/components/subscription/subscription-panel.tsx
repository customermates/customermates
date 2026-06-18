"use client";

import type { SubscriptionDto } from "@/ee/subscription/get-subscription.interactor";
import type { ReactNode } from "react";
import type { ChipColor } from "@/constants/chip-colors";

import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";
import { useEffect } from "react";
import { RefreshCw } from "lucide-react";
import { SubscriptionStatus } from "@/generated/prisma";

import { useRootStore } from "@/core/stores/root-store.provider";
import { Button } from "@/components/ui/button";
import { FormLabel } from "@/components/forms/form-label";
import { AppChip } from "@/components/chip/app-chip";
import { Icon } from "@/components/shared/icon";
import { cn } from "@/lib/utils";

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

function ReadOnlyField({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <FormLabel>{label}</FormLabel>

      <div className="flex h-9 w-full items-center rounded-md border border-input bg-muted/30 px-3 py-1.5 text-sm shadow-xs">
        {children}
      </div>
    </div>
  );
}

export const SubscriptionPanel = observer(({ initialSubscription }: Props) => {
  const t = useTranslations();
  const { subscriptionStore, intlStore } = useRootStore();

  useEffect(() => subscriptionStore.setSubscription(initialSubscription), [initialSubscription]);

  const subscription = subscriptionStore.subscription;
  const statusColor = subscription ? STATUS_COLOR_MAP[subscription.status] : "default";
  const statusLabel = t(`subscription.status.${subscription?.status ?? SubscriptionStatus.trial}`);
  const planLabel = "Pro";
  const showSeats = Boolean(subscription?.quantity);

  return (
    <section className="flex w-full flex-col gap-4">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          {t("subscription.title")}
        </h3>

        {subscription?.status !== SubscriptionStatus.trial && (
          <Button
            aria-label="Refresh subscription"
            className="size-6"
            size="icon-xs"
            variant="ghost"
            onClick={() => void subscriptionStore.handleRefresh()}
          >
            <Icon icon={RefreshCw} size="sm" />
          </Button>
        )}
      </div>

      <ReadOnlyField label={t("subscription.plan")}>
        <span className="flex w-full items-center justify-between gap-2">
          <span>{planLabel}</span>

          <AppChip className="shrink-0" size="sm" variant={statusColor}>
            {statusLabel}
          </AppChip>
        </span>
      </ReadOnlyField>

      <div className="grid w-full grid-cols-1 gap-3 sm:grid-cols-2">
        {subscription?.trialEndDate && subscription.status === SubscriptionStatus.trial && (
          <ReadOnlyField label={t("subscription.trialEnds")}>
            {subscription.trialEndDate ? intlStore.formatDescriptiveLongDate(subscription.trialEndDate) : "-"}
          </ReadOnlyField>
        )}

        {subscription?.currentPeriodEnd && (
          <ReadOnlyField label={t("subscription.currentPeriodEnd")}>
            {subscription.currentPeriodEnd ? intlStore.formatDescriptiveLongDate(subscription.currentPeriodEnd) : "-"}
          </ReadOnlyField>
        )}

        {showSeats && (
          <ReadOnlyField label={t("subscription.quantity")}>{subscription?.quantity?.toString() ?? ""}</ReadOnlyField>
        )}
      </div>

      {showSeats && <p className="text-xs text-muted-foreground">{t("subscription.prorationSubtitle")}</p>}
    </section>
  );
});
