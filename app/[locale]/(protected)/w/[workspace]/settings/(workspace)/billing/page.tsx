import { Resource } from "@/generated/prisma";

import { SubscriptionView } from "../components/subscription/subscription-view";

import {
  getGetFileStorageUsageInteractor,
  getGetPlanFitInteractor,
  getGetPlanUsageInteractor,
  getGetSubscriptionInteractor,
} from "@/core/di";
import { recommendedPlan } from "@/core/commercial/plan-fit";
import { requireAccess } from "@/features/auth/next/require";
import { redirect } from "next/navigation";
import { appRedirectHref } from "@/features/auth/next/app-redirect";
import { PageContainer } from "@/components/shared/page-container";
import { env } from "@/env";
import { BILLING_PLAN_PARAM, billingFocusPlan } from "@/app/components/navigation/settings-routes";
import { unwrapPage } from "@/core/validation/next/unwrap-page";

type Props = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function CompanySubscriptionPage({ searchParams }: Props) {
  await requireAccess({ resource: Resource.company });
  const focusPlan = billingFocusPlan((await searchParams)[BILLING_PLAN_PARAM]);

  if (env.APP_MODE === "self-hosted") redirect(await appRedirectHref("/dashboard"));

  const [subscription, storage, usage, fit] = await Promise.all([
    unwrapPage(getGetSubscriptionInteractor().invoke()),
    unwrapPage(getGetFileStorageUsageInteractor().invoke()),
    unwrapPage(getGetPlanUsageInteractor().invoke()),
    unwrapPage(getGetPlanFitInteractor().invoke()),
  ]);

  return (
    <PageContainer>
      <SubscriptionView
        focusPlan={focusPlan}
        initialSubscription={subscription}
        recommendedPlan={recommendedPlan(fit)}
        storage={storage}
        usage={usage}
      />
    </PageContainer>
  );
}
