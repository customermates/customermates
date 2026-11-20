import type { Validated } from "@/core/validation/validation.utils";
import type { AgentJobRepo } from "./agent-job.repo";
import type { AgentJobPage, GetAgentJobsData } from "./agent-job.schema";

import { Resource } from "@/generated/prisma";
import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { roleReadScope } from "@/core/base/permission.service";
import { AllowInDemoMode } from "@/core/decorators/allow-in-demo-mode.decorator";
import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { Validate } from "@/core/decorators/validate.decorator";
import { ValidateOutput } from "@/core/decorators/validate-output.decorator";
import { fail } from "@/core/validation/interactor-failure-server";
import { CustomErrorCode } from "@/core/validation/validation.types";

import { decodeAgentJobCursor, encodeAgentJobCursor } from "./agent-job-cursor";
import { mayReadAgentJobContent, toAgentJobSummary } from "./agent-job-dto";
import { readableRulesOfJobs } from "./agent-job-rule";
import { AGENT_JOB_PAGE_SIZE, AgentJobPageSchema, GetAgentJobsSchema } from "./agent-job.schema";

@AllowInDemoMode
@TenantInteractor({ resource: Resource.routines, read: true })
export class GetAgentJobsInteractor extends AuthenticatedInteractor<GetAgentJobsData, AgentJobPage> {
  constructor(private readonly repo: AgentJobRepo) {
    super();
  }

  @Validate(GetAgentJobsSchema)
  @ValidateOutput(AgentJobPageSchema)
  async invoke(data: GetAgentJobsData): Validated<AgentJobPage> {
    const decoded = decodeAgentJobCursor(data.cursor);
    if (!decoded.valid) return fail(CustomErrorCode.agentJobCursorInvalid, ["cursor"]);
    const rows = await this.repo.findPage({
      ...(roleReadScope(this.user.role, Resource.routines) === "all" ? {} : { ownerUserId: this.user.id }),
      ...(data.status ? { status: data.status } : {}),
      ...(data.sourceKind ? { sourceKind: data.sourceKind } : {}),
      ...(data.sourceId ? { sourceId: data.sourceId } : {}),
      cursor: decoded.cursor,
      limit: AGENT_JOB_PAGE_SIZE + 1,
    });
    const page = rows.slice(0, AGENT_JOB_PAGE_SIZE);
    const last = page.at(-1);
    const ruleOf = await readableRulesOfJobs(this.repo, this.user, page);
    return {
      ok: true as const,
      data: {
        jobs: page.map((job) => toAgentJobSummary(job, mayReadAgentJobContent(this.user, job), ruleOf(job))),
        nextCursor:
          rows.length > AGENT_JOB_PAGE_SIZE && last
            ? encodeAgentJobCursor({ createdAt: last.createdAt, id: last.id })
            : null,
      },
    };
  }
}
