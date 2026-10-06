import { Resource } from "@/generated/prisma";

import { ActivityPageView } from "../components/activity/activity-page-view";

import { requireAccess } from "@/features/auth/next/require";
import { PageContainer } from "@/components/shared/page-container";

export default async function CompanyActivityPage() {
  await requireAccess({ resource: Resource.auditLog });

  return (
    <PageContainer>
      <ActivityPageView />
    </PageContainer>
  );
}
