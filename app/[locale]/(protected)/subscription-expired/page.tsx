import { redirect } from "next/navigation";

import { SubscriptionExpiredView } from "./components/subscription-expired-view";

import { requireAccountState } from "@/features/auth/next/require";
import { isSubscriptionExpired } from "@/ee/subscription/entitlements";
import { CenteredCardPage } from "@/components/shared/centered-card-page";
import { resolveSubscriptionRecoveryPath } from "@/features/auth/subscription-recovery";
import { settingsHref } from "@/app/components/navigation/settings-routes";

export default async function SubscriptionExpiredPage() {
  const resolution = await requireAccountState("subscription", settingsHref("plan"));
  const { subscription, user } = resolution;

  if (!user || !subscription || !isSubscriptionExpired(subscription)) redirect(settingsHref("plan"));

  return (
    <CenteredCardPage className="animate-page-result-in motion-reduce:animate-none">
      <SubscriptionExpiredView recoveryPath={resolveSubscriptionRecoveryPath(user, subscription.plan)} />
    </CenteredCardPage>
  );
}
