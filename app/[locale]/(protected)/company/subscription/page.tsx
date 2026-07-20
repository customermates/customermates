import { Resource } from "@/generated/prisma";

import { SubscriptionView } from "../components/subscription/subscription-view";

import { getGetSubscriptionInteractor } from "@/core/di";
import { requireAccess } from "@/features/auth/next/require";
import { redirect } from "next/navigation";
import { PageContainer } from "@/components/shared/page-container";
import { env } from "@/env";

export default async function CompanySubscriptionPage() {
  await requireAccess({ resource: Resource.company });

  if (env.APP_MODE === "self-hosted") redirect("/dashboard");

  const subscriptionResult = await getGetSubscriptionInteractor().invoke();

  return (
    <PageContainer>
      <SubscriptionView initialSubscription={subscriptionResult.data} />
    </PageContainer>
  );
}
