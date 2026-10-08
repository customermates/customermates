"use client";

import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";
import { Action, Resource } from "@/generated/prisma";

import { TopBarPrimaryButton } from "@/components/shared/top-bar-action-buttons";
import { AppImage } from "@/components/shared/app-image";
import { useRootStore } from "@/core/stores/root-store.provider";
import { runUserAction } from "@/core/errors/report-application-error";

export const SubscribeManageButton = observer(() => {
  const t = useTranslations();
  const { subscriptionStore, userStore } = useRootStore();

  if (!userStore.can(Resource.company, Action.update)) return null;

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
    <TopBarPrimaryButton
      anchorId="company-subscription-manage"
      label={t("Subscription.manageWithLemonSqueezy")}
      leading={icon}
      onClick={() => runUserAction(() => subscriptionStore.handleManageBilling())}
    />
  );
});
