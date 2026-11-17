import { AgentsPageView } from "@/components/agent-keys/agents-page-view";
import { ConnectionScopeLine } from "@/components/connections/connection-scope-line";
import {
  getGetAgentJobsInteractor,
  getGetAgentProviderKeysInteractor,
  getGetAgentRunnersInteractor,
  getGetAgentRuntimeAvailabilityInteractor,
} from "@/core/di";
import { AppErrorCode, ForbiddenError } from "@/core/errors/app-errors";
import { unwrapPage } from "@/core/validation/next/unwrap-page";

async function recentRuns() {
  try {
    return await unwrapPage(getGetAgentJobsInteractor().invoke({}));
  } catch (error) {
    if (error instanceof ForbiddenError && error.code === AppErrorCode.permissionDenied) return null;
    throw error;
  }
}

export async function ConnectionAgentsTab() {
  const [keys, runners, availability, runs] = await Promise.all([
    unwrapPage(getGetAgentProviderKeysInteractor().invoke()),
    unwrapPage(getGetAgentRunnersInteractor().invoke()),
    unwrapPage(getGetAgentRuntimeAvailabilityInteractor().invoke()),
    recentRuns(),
  ]);

  return (
    <div className="flex flex-col gap-4" data-connection-tab="agents">
      <ConnectionScopeLine owner="workspace" scope="agents" />

      <AgentsPageView availability={availability} keys={keys.keys} runners={runners.runners} runs={runs} />
    </div>
  );
}
