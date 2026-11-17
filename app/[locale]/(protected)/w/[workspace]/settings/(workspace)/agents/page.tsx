import { Resource } from "@/generated/prisma";

import { AgentRunnersPageView } from "@/components/agent-runners/agent-runners-page-view";
import { getGetAgentRunnersInteractor } from "@/core/di";
import { requireAccess } from "@/features/auth/next/require";
import { PageContainer } from "@/components/shared/page-container";
import { unwrapPage } from "@/core/validation/next/unwrap-page";

export default async function AgentsSettingsPage() {
  await requireAccess({ resource: Resource.api });

  const { runners } = await unwrapPage(getGetAgentRunnersInteractor().invoke());

  return (
    <PageContainer>
      <AgentRunnersPageView runners={runners} />
    </PageContainer>
  );
}
