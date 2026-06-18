import { Resource } from "@/generated/prisma";

import { ConnectedAccountsCard } from "../components/connected-accounts-card";

import { getGetMyConnectedAccountsInteractor } from "@/core/di";
import { requireAccess } from "@/features/auth/next/require";
import { PageContainer } from "@/components/shared/page-container";

export default async function ConnectedAccountsPage() {
  await requireAccess({ resource: Resource.inboxMessages });

  const result = await getGetMyConnectedAccountsInteractor().invoke();
  const accounts = result.ok ? result.data : [];

  return (
    <PageContainer>
      <ConnectedAccountsCard accounts={accounts} />
    </PageContainer>
  );
}
