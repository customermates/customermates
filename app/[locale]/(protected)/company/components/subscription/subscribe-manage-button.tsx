"use client";

import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";
import { Resource } from "@/generated/prisma";

import { Button } from "@/components/ui/button";
import { AppLink } from "@/components/shared/app-link";
import { AppImage } from "@/components/shared/app-image";
import { useRootStore } from "@/core/stores/root-store.provider";

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

  if (subscription?.customerPortalUrl) {
    return (
      <AppLink external href={subscription.customerPortalUrl}>
        <Button className="h-8" size="sm">
          {icon}

          <span className="hidden sm:inline">{t("subscription.manageWithLemonSqueezy")}</span>
        </Button>
      </AppLink>
    );
  }

  return (
    <Button className="h-8" size="sm" onClick={() => void subscriptionStore.handleSubscribe()}>
      {icon}

      <span className="hidden sm:inline">{t("subscription.subscribeWithLemonSqueezy")}</span>
    </Button>
  );
});
