"use client";

import { useMemo } from "react";
import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";
import { RefreshCw } from "lucide-react";
import { SubscriptionPlan, SubscriptionStatus } from "@/generated/prisma";

import type { SubscriptionDto } from "@/ee/subscription/get-subscription.interactor";

import { Button } from "@/components/ui/button";
import { useRootStore } from "@/core/stores/root-store.provider";
import { useSetTopBarActions } from "@/app/components/topbar-actions-context";
import { runUserAction } from "@/core/errors/report-application-error";

import { SubscriptionPanel } from "./subscription-panel";
import { SubscribeManageButton } from "./subscribe-manage-button";

type Props = {
  initialSubscription: SubscriptionDto | null;
};

export const SubscriptionView = observer(({ initialSubscription }: Props) => {
  const t = useTranslations();
  const { subscriptionStore } = useRootStore();

  const subscription = subscriptionStore.subscription ?? initialSubscription;
  const showRefresh =
    subscription?.plan !== SubscriptionPlan.enterprise && subscription?.status !== SubscriptionStatus.trial;

  const topBarActions = useMemo(
    () => (
      <div className="flex items-center gap-1">
        {showRefresh && (
          <Button
            aria-label={t("Subscription.refresh")}
            className="h-8"
            size="sm"
            variant="secondary"
            onClick={() => runUserAction(() => subscriptionStore.handleRefresh())}
          >
            <RefreshCw className="size-3.5" />

            <span className="hidden sm:inline">{t("Subscription.refresh")}</span>
          </Button>
        )}

        <SubscribeManageButton />
      </div>
    ),
    [showRefresh, subscriptionStore, t],
  );
  useSetTopBarActions(topBarActions);

  return (
    <div className="animate-page-result-in flex w-full max-w-3xl flex-col gap-4 motion-reduce:animate-none">
      <SubscriptionPanel initialSubscription={initialSubscription} />
    </div>
  );
});
