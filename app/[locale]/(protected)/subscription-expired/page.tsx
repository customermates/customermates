import { redirect } from "next/navigation";

import { SubscriptionExpiredView } from "./components/subscription-expired-view";

import { requireAccountState } from "@/features/auth/next/require";
import { isAwaitingFirstPlan, isSubscriptionExpired } from "@/ee/subscription/entitlements";
import { checkoutStateOf } from "@/ee/subscription/checkout-state";
import { CenteredCardPage } from "@/components/shared/centered-card-page";
import { resolveSubscriptionRecoveryPath } from "@/features/auth/subscription-recovery";
import { settingsHref } from "@/app/components/navigation/settings-routes";
import { getGetWorkspaceDeletionInteractor } from "@/core/di";
import { unwrapPage } from "@/core/validation/next/unwrap-page";

export default async function SubscriptionExpiredPage() {
  const resolution = await requireAccountState("subscription", settingsHref("billing"));
  const { subscription, user } = resolution;

  if (!user || !subscription || !isSubscriptionExpired(subscription)) redirect(settingsHref("billing"));

  const deletion = user.role?.isSystemRole ? await unwrapPage(getGetWorkspaceDeletionInteractor().invoke()) : null;

  return (
    <CenteredCardPage className="animate-page-result-in motion-reduce:animate-none">
      <SubscriptionExpiredView
        checkout={checkoutStateOf(subscription.checkoutStartedAt)}
        deleteRefusal={deletion ? deletion.refusal : undefined}
        firstPlan={isAwaitingFirstPlan(subscription)}
        recoveryPath={resolveSubscriptionRecoveryPath(user, subscription.plan)}
      />
    </CenteredCardPage>
  );
}
