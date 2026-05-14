import { Resource } from "@/generated/prisma";

import { CompanyDetailsForm } from "../components/company-details/company-details-form";

import { getGetCompanyDetailsInteractor, getGetSubscriptionInteractor } from "@/core/app-di";
import { requireAccess } from "@/features/auth/next/require";
import { PageContainer } from "@/components/shared/page-container";
import { env } from "@/env";

export default async function CompanyDetailsPage() {
  await requireAccess({ resource: Resource.company });

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
