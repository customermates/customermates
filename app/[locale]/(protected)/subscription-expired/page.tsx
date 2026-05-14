import { redirect } from "next/navigation";
import { SubscriptionStatus } from "@/generated/prisma";
import { Resource } from "@/generated/prisma";

import { SubscriptionExpiredView } from "./components/subscription-expired-view";

import { getGetSubscriptionInteractor } from "@/core/app-di";
import { requireAccess } from "@/features/auth/next/require";
import { CenteredCardPage } from "@/components/shared/centered-card-page";

export default async function SubscriptionExpiredPage() {
  await requireAccess({
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

  if (!isExpired) redirect("/company/details");

  return (
    <CenteredCardPage>
      <SubscriptionExpiredView />
    </CenteredCardPage>
  );
}
