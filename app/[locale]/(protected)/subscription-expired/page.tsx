import { redirect } from "next/navigation";
import { SubscriptionStatus } from "@/generated/prisma";
import { Resource } from "@/generated/prisma";

import { SubscriptionExpiredCard } from "./components/subscription-expired-card";

import { GetSubscriptionInteractor } from "@/ee/subscription/get-subscription.interactor";
import { RouteGuardService } from "@/features/auth/route-guard.service";
import { XPageCenter } from "@/components/x-layout-primitives/x-page-center";
import { XPageContainer } from "@/components/x-layout-primitives/x-page-container";
import { di } from "@/core/dependency-injection/container";

export default async function SubscriptionExpiredPage() {
  await di.get(RouteGuardService).ensureAccessOrRedirect({
    resource: Resource.company,
    skipSubscriptionCheck: true,
  });

  const subscription = await di.get(GetSubscriptionInteractor).invoke();

  const isExpired =
    subscription.status === SubscriptionStatus.unPaid ||
    subscription.status === SubscriptionStatus.expired ||
    (subscription.status === SubscriptionStatus.trial &&
      subscription.trialEndDate !== null &&
      subscription.trialEndDate < new Date());

  if (!isExpired) redirect("/company");

  return (
    <XPageContainer>
      <XPageCenter showGridBackground>
        <SubscriptionExpiredCard />
      </XPageCenter>
    </XPageContainer>
  );
}
