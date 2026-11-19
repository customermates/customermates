import { Resource } from "@/generated/prisma";

import {
  getGetAgentJobsInteractor,
  getGetAgentProviderKeysInteractor,
  getGetAgentRunnersInteractor,
  getGetAgentRuntimeAvailabilityInteractor,
} from "@/core/di";
import { AgentsPageView } from "@/components/agent-keys/agents-page-view";
import { AppErrorCode, ForbiddenError } from "@/core/errors/app-errors";
import { requireAccess } from "@/features/auth/next/require";
import { PageContainer } from "@/components/shared/page-container";
import { unwrapPage } from "@/core/validation/next/unwrap-page";

async function unlessDenied<T>(load: () => Promise<T>): Promise<T | null> {
  try {
    return await load();
  } catch (error) {
    if (error instanceof ForbiddenError && error.code === AppErrorCode.permissionDenied) return null;
    throw error;
  }
}

export default async function CompanyAgentsPage() {
  await requireAccess({ resource: Resource.company });

  const [keys, runners, availability, runs] = await Promise.all([
    unwrapPage(getGetAgentProviderKeysInteractor().invoke()),
    unlessDenied(() => unwrapPage(getGetAgentRunnersInteractor().invoke())),
    unwrapPage(getGetAgentRuntimeAvailabilityInteractor().invoke({})),
    unlessDenied(() => unwrapPage(getGetAgentJobsInteractor().invoke({}))),
  ]);

  return (
    <PageContainer>
      <AgentsPageView availability={availability} keys={keys.keys} runners={runners?.runners ?? null} runs={runs} />
    </PageContainer>
  );
}
