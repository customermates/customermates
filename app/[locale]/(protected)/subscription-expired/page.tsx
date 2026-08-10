import { redirect } from "next/navigation";

import { SubscriptionExpiredView } from "./components/subscription-expired-view";

import { requireAccountState } from "@/features/auth/next/require";
import { isSubscriptionExpired } from "@/ee/subscription/entitlements";
import { CenteredCardPage } from "@/components/shared/centered-card-page";
import { resolveSubscriptionRecoveryMode } from "@/features/auth/subscription-recovery";

export default async function SubscriptionExpiredPage() {
  const resolution = await requireAccountState("subscription", "/company/subscription");
  const { subscription, user } = resolution;

  if (!user || !subscription || !isSubscriptionExpired(subscription)) redirect("/company/subscription");

  return (
    <CenteredCardPage className="animate-page-result-in motion-reduce:animate-none">
      <SubscriptionExpiredView recoveryMode={resolveSubscriptionRecoveryMode(user, subscription.plan)} />
    </CenteredCardPage>
  );
}
