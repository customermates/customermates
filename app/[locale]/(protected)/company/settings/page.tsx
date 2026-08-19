import { Resource } from "@/generated/prisma";

import { CompanySettingsForm } from "../components/company-settings/company-settings-form";

import { getGetCompanySettingsInteractor } from "@/core/di";
import { requireAccess } from "@/features/auth/next/require";
import { PageContainer } from "@/components/shared/page-container";

export default async function CompanySettingsPage() {
  await requireAccess({ resource: Resource.company });

  const companyResult = await getGetCompanySettingsInteractor().invoke();

  return (
    <PageContainer>
      <CompanySettingsForm
        currency={companyResult.data.currency}
        dealWeightingColumnId={companyResult.data.dealWeightingColumnId}
      />
    </PageContainer>
  );
}
