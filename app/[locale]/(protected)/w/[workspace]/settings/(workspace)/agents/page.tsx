import { Resource } from "@/generated/prisma";

import {
  getGetAgentJobsInteractor,
  getGetAgentProviderKeysInteractor,
  getGetAgentRunnersInteractor,
  getGetAgentRuntimeAvailabilityInteractor,
} from "@/core/di";
import { AgentsPageView } from "@/components/agent-keys/agents-page-view";
import { PageContainer } from "@/components/shared/page-container";
import { AppErrorCode, ForbiddenError } from "@/core/errors/app-errors";
import { unwrapPage } from "@/core/validation/next/unwrap-page";
import { requireAccess } from "@/features/auth/next/require";

async function recentRuns() {
  try {
    return await unwrapPage(getGetAgentJobsInteractor().invoke({}));
  } catch (error) {
    if (error instanceof ForbiddenError && error.code === AppErrorCode.permissionDenied) return null;
    throw error;
  }
}

export default async function WorkspaceAgentsPage() {
  await requireAccess({ resource: Resource.company });

  const [keys, runners, availability, runs] = await Promise.all([
    unwrapPage(getGetAgentProviderKeysInteractor().invoke()),
    unwrapPage(getGetAgentRunnersInteractor().invoke()),
    unwrapPage(getGetAgentRuntimeAvailabilityInteractor().invoke()),
    recentRuns(),
  ]);

  return (
    <PageContainer>
      <AgentsPageView availability={availability} keys={keys.keys} runners={runners.runners} runs={runs} />
    </PageContainer>
  );
}
