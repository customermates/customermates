"use client";

import { useMemo } from "react";
import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";
import { RefreshCw } from "lucide-react";
import { Action, Resource, SubscriptionPlan, SubscriptionStatus } from "@/generated/prisma";

import type { SubscriptionDto } from "@/ee/subscription/get-subscription.interactor";

import { Button } from "@/components/ui/button";
import { useRootStore } from "@/core/stores/root-store.provider";
import { useSetTopBarActions } from "@/app/components/topbar-actions-context";
import { runUserAction } from "@/core/errors/report-application-error";

import { SubscriptionPanel } from "./subscription-panel";
import { SubscribeManageButton } from "./subscribe-manage-button";
import { serverRenderedClient } from "@/core/utils/server-rendered-client";

type Props = {
  initialSubscription: SubscriptionDto | null;
};

const SubscriptionViewContent = observer(({ initialSubscription }: Props) => {
  const t = useTranslations();
  const { subscriptionStore, userStore } = useRootStore();

  const subscription = subscriptionStore.subscription ?? initialSubscription;
  const showRefresh =
    userStore.can(Resource.company, Action.update) &&
    subscription?.hasActiveSubscription === true &&
    subscription.plan !== SubscriptionPlan.enterprise &&
    subscription.status !== SubscriptionStatus.trial;

  const topBarActions = useMemo(
    () => (
      <div className="flex items-center gap-1">
        {showRefresh && (
          <Button
            aria-label={t("Subscription.refresh")}
            className="h-8"
            id="settings-billing-refresh"
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

export const SubscriptionView = serverRenderedClient(SubscriptionViewContent);
