import { redirect } from "next/navigation";
import { Resource } from "@/generated/prisma";

import { SubscriptionExpiredView } from "./components/subscription-expired-view";

import { getGetSubscriptionInteractor } from "@/core/di";
import { requireAccess } from "@/features/auth/next/require";
import { isSubscriptionExpired } from "@/ee/subscription/entitlements";
import { CenteredCardPage } from "@/components/shared/centered-card-page";

export default async function SubscriptionExpiredPage() {
  await requireAccess({
    resource: Resource.company,
    skipSubscriptionCheck: true,
  });

  const subscriptionResult = await getGetSubscriptionInteractor().invoke();
  const subscription = subscriptionResult.data;

  if (!isSubscriptionExpired(subscription)) redirect("/company/subscription");

  return (
    <CenteredCardPage className="animate-page-result-in motion-reduce:animate-none">
      <SubscriptionExpiredView />
    </CenteredCardPage>
  );
}
