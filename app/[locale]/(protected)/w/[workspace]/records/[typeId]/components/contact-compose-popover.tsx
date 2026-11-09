"use client";

import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";

import type { MessagingProvider } from "@/generated/prisma";

import { ThreadReplyComposer } from "@/app/[locale]/(protected)/w/[workspace]/inbox/components/thread-reply-composer";
import { useRootStore } from "@/core/stores/root-store.provider";
import { effectivePlanId, getEntitlements } from "@/ee/subscription/entitlements";
import { MESSAGING_UPSELL_PLAN } from "@/app/components/upsell/plan-upsell-highlights";
import { PlanUpsellNotice } from "@/app/components/upsell/plan-upsell-notice";

type Props = {
  provider: MessagingProvider;
};

export const ContactComposePopover = observer(({ provider }: Props) => {
  const t = useTranslations();
  const { connectedAccountsStore, subscriptionStore } = useRootStore();
  const subscription = subscriptionStore.subscription;
  const planLacksMessaging = subscription != null && !getEntitlements(effectivePlanId(subscription)).messaging;

  if (connectedAccountsStore.usableSendersFor(provider).length === 0 && planLacksMessaging) {
    return (
      <PlanUpsellNotice
        compact
        className="rounded-none border-0"
        detail={t("Upsell.pro.drafts")}
        id="record-compose"
        plan={MESSAGING_UPSELL_PLAN}
        title={t("Upsell.compose.title", { plan: t(`Subscription.planNames.${MESSAGING_UPSELL_PLAN}`) })}
      />
    );
  }

  if (connectedAccountsStore.usableSendersFor(provider).length === 0) {
    return (
      <p className="text-muted-foreground p-4 text-xs">
        {t("EntityChannels.compose.noAccount", { provider: t(`Common.providers.${provider}`) })}
      </p>
    );
  }

  return <ThreadReplyComposer bare provider={provider} />;
});
