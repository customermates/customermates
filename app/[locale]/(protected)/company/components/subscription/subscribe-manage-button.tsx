"use client";

import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";
import { Resource } from "@/generated/prisma";

import { Button } from "@/components/ui/button";
import { AppImage } from "@/components/shared/app-image";
import { useRootStore } from "@/core/stores/root-store.provider";
import { runUserAction } from "@/core/errors/report-application-error";

export const SubscribeManageButton = observer(() => {
  const t = useTranslations();
  const { subscriptionStore, userStore } = useRootStore();

  if (!userStore.canManage(Resource.company)) return null;

  const subscription = subscriptionStore.subscription;
  const icon = (
    <AppImage
      alt="Lemon Squeezy"
      className="rounded-none object-contain"
      height={14}
      src="lemonsqueezy.svg"
      width={14}
    />
  );

  if (!subscription?.hasBillingPortal) return null;

  return (
    <Button
      className="h-8"
      id="company-subscription-manage"
      size="sm"
      onClick={() => runUserAction(() => subscriptionStore.handleManageBilling())}
    >
      {icon}

      <span className="hidden sm:inline">{t("Subscription.manageWithLemonSqueezy")}</span>
    </Button>
  );
});
