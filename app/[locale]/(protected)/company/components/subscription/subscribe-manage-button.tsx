"use client";

import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { AppLink } from "@/components/shared/app-link";
import { AppImage } from "@/components/shared/app-image";
import { useRootStore } from "@/core/stores/root-store.provider";

export const SubscribeManageButton = observer(() => {
  const t = useTranslations();
  const { subscriptionStore } = useRootStore();

  const subscription = subscriptionStore.subscription;
  if (!subscription?.canManageSubscription) return null;
  const icon = (
    <AppImage
      alt="Lemon Squeezy"
      className="rounded-none object-contain"
      height={14}
      src="lemonsqueezy.svg"
      width={14}
    />
  );

  if (!subscription?.customerPortalUrl) return null;

  return (
    <Button asChild className="h-8" size="sm">
      <AppLink external appearance="unstyled" href={subscription.customerPortalUrl}>
        {icon}

        <span className="hidden sm:inline">{t("Subscription.manageWithLemonSqueezy")}</span>
      </AppLink>
    </Button>
  );
});
