import type { TenantUser } from "@/features/user/user.schema";
import type { AgentJobRepo, StoredAgentJobSummary } from "./agent-job.repo";
import type { AgentJobRule } from "./agent-job.schema";

import { Resource } from "@/generated/prisma";
import { roleReadScope } from "@/core/base/permission.service";

import { AGENT_JOB_SOURCE_AUTOMATION } from "./agent-job.schema";

type JobSource = Pick<StoredAgentJobSummary, "sourceKind" | "sourceId">;

function automationRunId(job: JobSource): string | null {
  return job.sourceKind === AGENT_JOB_SOURCE_AUTOMATION ? job.sourceId : null;
}

export async function readableRulesOfJobs(
  repo: Pick<AgentJobRepo, "findRulesOfRuns">,
  user: Pick<TenantUser, "id" | "role">,
  jobs: JobSource[],
): Promise<(job: JobSource) => AgentJobRule | null> {
  const runIds = [...new Set(jobs.flatMap((job) => automationRunId(job) ?? []))];
  const rules = await repo.findRulesOfRuns(runIds);
  const everyRule = roleReadScope(user.role, Resource.routines) === "all";
  const byRun = new Map<string, AgentJobRule>();
  for (const rule of rules)
    if (everyRule || rule.ownerUserId === user.id) byRun.set(rule.runId, { id: rule.ruleId, name: rule.name });
  return (job) => byRun.get(automationRunId(job) ?? "") ?? null;
}
