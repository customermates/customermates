import { Resource } from "@/generated/prisma";

import { SubscriptionView } from "../components/subscription/subscription-view";

import { getGetFileStorageUsageInteractor, getGetSubscriptionInteractor } from "@/core/di";
import { requireAccess } from "@/features/auth/next/require";
import { redirect } from "next/navigation";
import { PageContainer } from "@/components/shared/page-container";
import { env } from "@/env";
import { unwrapPage } from "@/core/validation/next/unwrap-page";

export default async function CompanySubscriptionPage() {
  await requireAccess({ resource: Resource.company });

  if (env.APP_MODE === "self-hosted") redirect("/dashboard");

  const [subscription, storage] = await Promise.all([
    unwrapPage(getGetSubscriptionInteractor().invoke()),
    unwrapPage(getGetFileStorageUsageInteractor().invoke()),
  ]);

  return (
    <PageContainer>
      <SubscriptionView initialSubscription={subscription} storage={storage} />
    </PageContainer>
  );
}
