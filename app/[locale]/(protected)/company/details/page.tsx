import { Resource } from "@/generated/prisma";

import { CompanyDetailsForm } from "../components/company-details/company-details-form";

import { getGetCompanyDetailsInteractor, getGetSubscriptionInteractor, getRouteGuardService } from "@/core/app-di";
import { PageContainer } from "@/components/shared/page-container";
import { env } from "@/env";

export default async function CompanyDetailsPage() {
  await getRouteGuardService().ensureAccessOrRedirect({ resource: Resource.company });

  const [companyResult, subscriptionResult] = await Promise.all([
    getGetCompanyDetailsInteractor().invoke(),
    env.CLOUD_HOSTED ? getGetSubscriptionInteractor().invoke() : Promise.resolve({ ok: true as const, data: null }),
  ]);

  return (
    <PageContainer>
      <CompanyDetailsForm
        company={companyResult.data}
        initialSubscription={subscriptionResult.data}
        showSubscription={env.CLOUD_HOSTED}
      />
    </PageContainer>
  );
}
