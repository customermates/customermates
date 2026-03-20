"use client";

import type { SubscriptionDto } from "@/ee/subscription/get-subscription.interactor";
import type { ChipColor } from "@/constants/chip-colors";

import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";
import { useEffect } from "react";
import { Button } from "@heroui/button";
import { Link } from "@heroui/link";
import { ArrowPathIcon } from "@heroicons/react/24/outline";

import { SubscriptionPlan, SubscriptionStatus, Resource } from "@/generated/prisma";

import { useRootStore } from "@/core/stores/root-store.provider";
import { XCard } from "@/components/x-card/x-card";
import { XCardBody } from "@/components/x-card/x-card-body";
import { XCardHeader } from "@/components/x-card/x-card-header";
import { XChip } from "@/components/x-chip/x-chip";
import { XIcon } from "@/components/x-icon";
import { XImage } from "@/components/x-image";
import { XInfoRow } from "@/components/x-info-row";

type SubscriptionCardProps = {
  initialSubscription: SubscriptionDto | null;
};

export const SubscriptionCard = observer(({ initialSubscription }: SubscriptionCardProps) => {
  const t = useTranslations();
  const { subscriptionCardStore, userStore } = useRootStore();

  useEffect(() => subscriptionCardStore.setSubscription(initialSubscription), [initialSubscription]);

  const subscription = subscriptionCardStore.subscription;

  function getStatusColor(sub: SubscriptionDto | null) {
    if (!sub) return "default";

    const statusColorMap: Record<SubscriptionStatus, ChipColor> = {
      [SubscriptionStatus.active]: "success",
      [SubscriptionStatus.trial]: "warning",
      [SubscriptionStatus.expired]: "danger",
      [SubscriptionStatus.pastDue]: "danger",
      [SubscriptionStatus.unPaid]: "danger",
      [SubscriptionStatus.cancelled]: "default",
    };

    return statusColorMap[sub.status];
  }

  function getStatusLabel(sub: SubscriptionDto | null) {
    if (!sub) return t("subscription.status.trial");

    const labelMap: Record<SubscriptionStatus, string> = {
      [SubscriptionStatus.trial]: t("subscription.status.trial"),
      [SubscriptionStatus.active]: t("subscription.status.active"),
      [SubscriptionStatus.cancelled]: t("subscription.status.cancelled"),
      [SubscriptionStatus.expired]: t("subscription.status.expired"),
      [SubscriptionStatus.pastDue]: t("subscription.status.pastDue"),
      [SubscriptionStatus.unPaid]: t("subscription.status.unPaid"),
    };

    return labelMap[sub.status];
  }

  function formatDate(date: Date | null) {
    if (!date) return "-";
    return new Intl.DateTimeFormat("en-US", { year: "numeric", month: "long", day: "numeric" }).format(date);
  }

  function getPlanLabel(sub: SubscriptionDto | null) {
    const plan = sub?.plan ?? SubscriptionPlan.pro;
    return plan === SubscriptionPlan.basic ? "Basic" : "Pro";
  }

  const lemonSqueezyIcon = (
    <XImage alt="Lemon Squeezy" className="rounded-none object-contain" height={16} src="lemonsqueezy.svg" width={16} />
  );

  return (
    <XCard>
      <XCardHeader>
        <div className="flex items-center gap-2 grow w-full">
          <h2 className="text-x-lg truncate">{t("subscription.title")}</h2>

          <XChip className="shrink-0" color={getStatusColor(subscription)} size="sm">
            {getStatusLabel(subscription)}
          </XChip>
        </div>

        {subscription?.status !== SubscriptionStatus.trial && (
          <Button
            isIconOnly
            color="primary"
            isLoading={subscriptionCardStore.refreshLoading}
            size="sm"
            variant="light"
            onPress={() => void subscriptionCardStore.handleRefresh()}
          >
            <XIcon icon={ArrowPathIcon} />
          </Button>
        )}
      </XCardHeader>

      <XCardBody>
        <XInfoRow label={t("subscription.plan")}>{getPlanLabel(subscription)}</XInfoRow>

        {subscription?.trialEndDate && subscription.status === SubscriptionStatus.trial && (
          <XInfoRow label={t("subscription.trialEnds")}>{formatDate(subscription.trialEndDate)}</XInfoRow>
        )}

        {subscription?.currentPeriodEnd && (
          <XInfoRow label={t("subscription.currentPeriodEnd")}>{formatDate(subscription.currentPeriodEnd)}</XInfoRow>
        )}

        {subscription?.quantity && (
          <XInfoRow label={t("subscription.quantity")}>{subscription.quantity.toString()}</XInfoRow>
        )}

        {subscription?.quantity && <p className="text-x-xs text-subdued">{t("subscription.prorationSubtitle")}</p>}

        {userStore.canManage(Resource.company) &&
          (subscription?.customerPortalUrl ? (
            <Button
              as={Link}
              className="w-full"
              color="primary"
              href={subscription.customerPortalUrl}
              startContent={lemonSqueezyIcon}
              target="_blank"
              variant="bordered"
            >
              <span className="truncate min-w-0">{t("subscription.manageWithLemonSqueezy")}</span>
            </Button>
          ) : (
            <Button
              className="w-full"
              color="primary"
              isLoading={subscriptionCardStore.checkoutLoading}
              startContent={lemonSqueezyIcon}
              onPress={() => void subscriptionCardStore.handleSubscribe()}
            >
              <span className="truncate min-w-0">{t("subscription.subscribeWithLemonSqueezy")}</span>
            </Button>
          ))}
      </XCardBody>
    </XCard>
  );
});
