import { redirect } from "next/navigation";
import { SubscriptionStatus } from "@/generated/prisma";
import { Resource } from "@/generated/prisma";

import { SubscriptionExpiredCard } from "./components/subscription-expired-card";

import { getGetSubscriptionInteractor, getRouteGuardService } from "@/core/di";
import { XPageCenter } from "@/components/x-layout-primitives/x-page-center";
import { XPageContainer } from "@/components/x-layout-primitives/x-page-container";

export default async function SubscriptionExpiredPage() {
  await getRouteGuardService().ensureAccessOrRedirect({
    resource: Resource.company,
    skipSubscriptionCheck: true,
  });

  const subscriptionResult = await getGetSubscriptionInteractor().invoke();
  const subscription = subscriptionResult.data;

  const isExpired =
    subscription.status === SubscriptionStatus.unPaid ||
    subscription.status === SubscriptionStatus.expired ||
    (subscription.status === SubscriptionStatus.trial &&
      subscription.trialEndDate !== null &&
      subscription.trialEndDate < new Date());

  if (!isExpired) redirect("/company");

  return (
    <XPageContainer>
      <XPageCenter>
        <SubscriptionExpiredCard />
      </XPageCenter>
    </XPageContainer>
  );
}
